"""Печатные версии страниц: обёртка в полноценный документ, печатный CSS и раскрытие блоков.

Опубликованный артефакт получает <!doctype>, <html> и <head> от платформы, а исходный файл —
это фрагмент. Для печати документ нужно собрать самому, заодно заставив светлую тему:
на бумаге тёмная подложка съедает картридж и читается хуже.

Запуск:

    python3 build_pdf.py

Скрипт кладёт печатные версии в ./print. Дальше из них печатаются PDF — нужен Google Chrome:

    cd print
    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
      --virtual-time-budget=15000 --run-all-compositor-stages-before-draw \
      --print-to-pdf="Растаможка на пальцах.pdf" "file://$PWD/customs-simple.print.html"

Шрифты подгружаются с Google Fonts, поэтому при печати нужен интернет.
"""
import pathlib
import re

PRINT_CSS = """
@page { size: A4; margin: 13mm 12mm 15mm; }

html, body { background: #fff !important; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { max-width: none !important; padding-inline: 0 !important; padding-block: 0 6mm !important; }
.masthead { padding-top: 6mm !important; }
/* Ширина листа A4 за вычетом полей — около 700 px, то есть меньше точки перелома
   для узких экранов. Без этого штемпель встаёт в поток слева, а не в угол бланка. */
.stamp { position: absolute !important; top: 7mm !important; right: 0 !important;
  margin: 0 !important; transform: rotate(-9deg) !important; width: 116px !important;
  height: 116px !important; }
h1 { max-width: 13ch; }

/* Иллюстрация колеи не должна рваться пополам. */
.gauge, .versus .vrow, .kind { break-inside: avoid; }
.kinds, .versus { border: 0 !important; }
.kind { border: 1px solid rgba(25,26,23,.20) !important; }

/* Интерактив на бумаге не работает. Лента этапов — это навигация: кликать по ней
   нельзя, а места она занимает столько, что следующий блок не влезает в остаток
   листа. Структуру держат заголовки фаз. */
.tabs, #toggleAll, .chev, .flowwrap { display: none !important; }

/* Таблицы подгоняем под ширину листа. */
.tablewrap { overflow: visible !important; }
table { min-width: 0 !important; width: 100% !important; table-layout: fixed; }
thead th, tbody td { padding: 9px 10px !important; font-size: 11.5px !important; word-break: break-word; }
td.head { width: 18% !important; }
td.head small, .pill { font-size: 9.5px !important; }

/* Разрывы страниц: заголовок не отрывается от блока, мелкие графы не рвутся. */
h1, h2, h3, h4 { break-after: avoid; }
.stage-btn, .section-head { break-after: avoid; }
.phase-head { break-after: auto; }
.doc, .breaks, .verify, .corr, .sp, .border-card, .axis, .bill,
.gloss div, .cast div, .path li, .term, .note, .seq .st { break-inside: avoid; }
tr { break-inside: avoid; }
section, .stage { break-inside: auto; }
/* overflow:hidden делает блок неразрывным в постраничной вёрстке. */
.stage { overflow: visible !important; }
.more, .callout { break-inside: avoid; }

/* Рамку носит сама графа, а не сетка вокруг неё: когда карточка переезжает на
   следующий лист, рамка контейнера остаётся на первом и рисует пустой прямоугольник. */
.borders, .dirs, .special, .cast, .gloss, .path, .corridors, .docs { border: 0 !important; }
.border-card, .dir, .sp, .corr, .doc { border: 1px solid rgba(25,26,23,.20) !important; }
.border-card { border-top-width: 3px !important; }
.dir { border-top-width: 3px !important; }
.cast > div, .gloss > div, .path > li { border: 1px solid rgba(25,26,23,.12) !important;
  margin-bottom: -1px; }
.path > li { padding-left: 0 !important; }

a { color: inherit !important; text-decoration: none; }
.more a { color: #453a94 !important; }
"""

EXPAND_JS = """
/* Бумага не умеет раскрывать: показываем всё содержимое сразу. */
document.querySelectorAll('.stage').forEach(function (s) {
  s.classList.add('open');
  var b = s.querySelector('.stage-btn');
  var d = s.querySelector('.stage-body');
  if (b) b.setAttribute('aria-expanded', 'true');
  if (d) d.hidden = false;
});
document.querySelectorAll('[role="tabpanel"]').forEach(function (p) { p.hidden = false; });
var docs = document.getElementById('view-docs');
if (docs && !docs.querySelector('h2')) {
  var h = document.createElement('div');
  h.className = 'section-head';
  h.style.marginTop = '34px';
  h.innerHTML = '<h2>Все документы одним списком</h2>';
  docs.insertBefore(h, docs.firstChild);
}
/* Подписи про нажатия на бумаге бессмысленны. */
document.querySelectorAll('.section-note').forEach(function (n) {
  if (/Нажмите/.test(n.textContent)) n.remove();
});
document.documentElement.setAttribute('data-ready', '1');
"""

SOURCES = [
    ("customs-pipeline.html", "Растаможка Китай — Казахстан.pdf"),
    ("kz-borders.html", "Границы Казахстана.pdf"),
    ("customs-simple.html", "Растаможка на пальцах.pdf"),
    ("rail.html", "Железная дорога Китай — Казахстан.pdf"),
]

here = pathlib.Path(__file__).parent
out = here / "print"
out.mkdir(exist_ok=True)

for src, pdf in SOURCES:
    raw = (here / src).read_text(encoding="utf-8")
    split = raw.index('<div class="page">')
    head, body = raw[:split], raw[split:]
    title = re.search(r"<title>(.*?)</title>", head).group(1)
    doc = (
        "<!doctype html>\n"
        '<html lang="ru" data-theme="light">\n<head>\n<meta charset="utf-8">\n'
        + head
        + f"<style>{PRINT_CSS}</style>\n</head>\n<body>\n"
        + body
        + f"\n<script>\n{EXPAND_JS}\n</script>\n</body>\n</html>\n"
    )
    target = out / (pathlib.Path(src).stem + ".print.html")
    target.write_text(doc, encoding="utf-8")
    print(f"{target.name}  ← {title}")
