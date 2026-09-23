"""Единый визуальный язык для трёх документов о растаможке.

Форма таможенной декларации — это сетка нумерованных граф с волосяными линиями,
подписи набраны узким моноширинным, а поверх стоит фиолетовый штемпель. Этот язык
принадлежит ровно этому предмету и никакому другому, поэтому страницы строятся по нему:
острые углы вместо скруглений, линии вместо теней, графа вместо карточки.
"""
import pathlib
import re
from urllib.parse import quote

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700'
         '&family=Spectral:wght@500;600;700&display=swap">')


def guilloche() -> str:
    """Защитная сетка: наложенные синусоиды, как на бланке строгой отчётности."""
    waves = []
    for i in range(7):
        phase = i * 0.9
        amp = 7 + (i % 3) * 2.5
        pts = []
        for x in range(0, 241, 6):
            import math
            y = 30 + amp * math.sin(x / 19.0 + phase) + 3 * math.sin(x / 7.0 - phase)
            pts.append(f"{x},{y:.1f}")
        waves.append('<polyline points="' + " ".join(pts) + '" fill="none" stroke="#453a94" '
                     'stroke-width=".5" opacity=".5"/>')
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" viewBox="0 0 240 60">'
           + "".join(waves) + "</svg>")
    return "url(\"data:image/svg+xml,%s\")" % quote(svg, safe="")


def stamp(text_top: str, line1: str, line2: str, tone: str) -> str:
    """Круглый штемпель. Единственная громкая деталь — всё остальное держится тихо."""
    return f'''<svg class="stamp {tone}" viewBox="0 0 132 132" aria-hidden="true">
      <defs><path id="stampring" d="M66,66 m-49,0 a49,49 0 1,1 98,0 a49,49 0 1,1 -98,0"/></defs>
      <circle cx="66" cy="66" r="58" fill="none" stroke="currentColor" stroke-width="2.6"/>
      <circle cx="66" cy="66" r="52" fill="none" stroke="currentColor" stroke-width=".9"/>
      <text class="stampring"><textPath href="#stampring" startOffset="50%" text-anchor="middle">{text_top}</textPath></text>
      <line x1="28" y1="52" x2="104" y2="52" stroke="currentColor" stroke-width=".9"/>
      <text class="stampbig" x="66" y="70" text-anchor="middle">{line1}</text>
      <text class="stampbig" x="66" y="86" text-anchor="middle">{line2}</text>
      <line x1="28" y1="94" x2="104" y2="94" stroke="currentColor" stroke-width=".9"/>
    </svg>'''


CSS = """
/* ============================================================
   Растаможка — единый визуальный язык серии.
   Источник формы: бланк таможенной декларации. Графы с волосяными
   линиями, моноширинные подписи граф, штемпельная краска, защитная
   сетка. Острые углы и линии вместо скруглений и теней: документ
   не парит над страницей, он на неё напечатан.
   ============================================================ */
:root{
  --paper:#eceee9;        /* бумага строгой отчётности, с зелёным подтоном */
  --form:#ffffff;         /* поле графы */
  --sunk:#f4f5f1;         /* утопленная вставка внутри графы */
  --ink:#191a17;          /* типографская краска */
  --mut:#585b54;
  --faint:#8a8d85;
  --rule:rgba(25,26,23,.20);      /* линия графы — основная разделительная */
  --rule-soft:rgba(25,26,23,.10);
  --stamp:#453a94;        /* штемпельная краска, фиолетовая */
  --stamp-soft:rgba(69,58,148,.09);
  --customs:#2d6a4d;      /* зелёный коридор */
  --customs-soft:rgba(45,106,77,.11);
  --seal:#ab332b;         /* красный штамп: досмотр, нарушение */
  --seal-soft:rgba(171,51,43,.09);
  --amber:#8a5a10;
  --amber-soft:rgba(138,90,16,.13);
  --warn-bg:#f7f2e4;
  --warn-line:rgba(138,90,16,.3);
  --guilloche:GUILLOCHE;
  --display:"Spectral",Georgia,"Times New Roman",serif;
  --sans:"Golos Text","Segoe UI",system-ui,-apple-system,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#131512; --form:#1a1c19; --sunk:#202320;
    --ink:#e9ebe5; --mut:#a4a89e; --faint:#7d8177;
    --rule:rgba(255,255,255,.20); --rule-soft:rgba(255,255,255,.09);
    --stamp:#9b8ce8; --stamp-soft:rgba(155,140,232,.13);
    --customs:#5fbf8d; --customs-soft:rgba(95,191,141,.13);
    --seal:#e0776e; --seal-soft:rgba(224,119,110,.12);
    --amber:#d5a13c; --amber-soft:rgba(213,161,60,.14);
    --warn-bg:rgba(213,161,60,.07); --warn-line:rgba(213,161,60,.28);
  }
}
:root[data-theme="dark"]{
  --paper:#131512; --form:#1a1c19; --sunk:#202320;
  --ink:#e9ebe5; --mut:#a4a89e; --faint:#7d8177;
  --rule:rgba(255,255,255,.20); --rule-soft:rgba(255,255,255,.09);
  --stamp:#9b8ce8; --stamp-soft:rgba(155,140,232,.13);
  --customs:#5fbf8d; --customs-soft:rgba(95,191,141,.13);
  --seal:#e0776e; --seal-soft:rgba(224,119,110,.12);
  --amber:#d5a13c; --amber-soft:rgba(213,161,60,.14);
  --warn-bg:rgba(213,161,60,.07); --warn-line:rgba(213,161,60,.28);
}

body{background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;
  -webkit-font-smoothing:antialiased;font-feature-settings:"ss01";}
.page{max-width:1080px;margin:0 auto;padding-inline:22px;padding-block:0 76px;}
@media (max-width:520px){ .page{padding-inline:15px;padding-block:0 56px;} }
h1,h2,h3,h4{margin:0;text-wrap:balance;}
p{margin:0;} ul,ol{margin:0;padding:0;list-style:none;}

/* ─── шапка: бланк с защитной сеткой и штемпелем ─── */
.masthead{position:relative;margin:0 0 40px;padding:44px 0 34px;
  border-bottom:2px solid var(--ink);}
.masthead::before{content:"";position:absolute;inset:0 0 auto;height:120px;
  background-image:var(--guilloche);background-repeat:repeat;opacity:.16;
  pointer-events:none;mask-image:linear-gradient(#000,transparent);
  -webkit-mask-image:linear-gradient(#000,transparent);}
.masthead > *{position:relative;}
.eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--stamp);font-weight:500;margin-bottom:16px;}
h1{font-family:var(--display);font-weight:600;font-size:clamp(33px,6.4vw,58px);line-height:1.03;
  letter-spacing:-.022em;max-width:15ch;}
.lede{margin-top:18px;font-size:17px;color:var(--mut);max-width:60ch;line-height:1.58;}
.route{margin-top:22px;display:flex;flex-wrap:wrap;gap:7px;align-items:center;
  font-family:var(--mono);font-size:11.5px;color:var(--mut);letter-spacing:.02em;}
.route b{font-weight:500;color:var(--ink);}
.route .sep{color:var(--stamp);}

/* штемпель — одна громкая деталь на документ */
.stamp{position:absolute;top:24px;right:0;width:124px;height:124px;color:var(--stamp);
  opacity:.9;transform:rotate(-9deg);pointer-events:none;}
.stamp.green{color:var(--customs);}
.stamp text{fill:currentColor;font-family:var(--mono);font-weight:500;}
.stampring{font-size:8.2px;letter-spacing:.26em;}
.stampbig{font-size:13.5px;font-weight:700;letter-spacing:.06em;}
@media (max-width:760px){ .stamp{position:static;display:block;margin:22px 0 0;transform:rotate(-5deg);} }

/* ─── секции ─── */
section{margin-bottom:46px;}
.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:18px;
  flex-wrap:wrap;margin-bottom:18px;padding-bottom:9px;border-bottom:1px solid var(--rule);}
h2{font-family:var(--display);font-weight:600;font-size:25px;letter-spacing:-.014em;}
.section-note{font-size:13px;color:var(--faint);max-width:52ch;line-height:1.5;}

/* ─── графа: базовый блок всей серии ─── */
.border-card,.stage,.dir,.tablewrap,.callout,.sp,.axis,.bill,.more,.doc,.corr,.term,.note,.breaks,.verify{
  border-radius:0;box-shadow:none;}
.border-card,.stage,.dir,.tablewrap,.callout,.sp,.axis,.bill,.more{
  background:var(--form);border:1px solid var(--rule);}

/* ─── страница 1: границы, лента, этапы ─── */
.borders{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-bottom:46px;
  border:1px solid var(--rule);}
@media (max-width:820px){ .borders{grid-template-columns:minmax(0,1fr);} }
.border-card{border:0;border-right:1px solid var(--rule);border-top:3px solid var(--bc,var(--stamp));
  padding:17px 18px 19px;}
.border-card:last-child{border-right:0;}
@media (max-width:820px){ .border-card{border-right:0;border-bottom:1px solid var(--rule);}
  .border-card:last-child{border-bottom:0;} }
.border-card .tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--bc,var(--stamp));font-weight:500;}
.border-card h3{font-family:var(--display);font-size:18px;font-weight:600;margin:8px 0 9px;}
.border-card p{font-size:13.5px;color:var(--mut);line-height:1.52;}
.border-card .where{margin-top:12px;padding-top:11px;border-top:1px solid var(--rule-soft);
  font-family:var(--mono);font-size:10.5px;color:var(--faint);letter-spacing:.04em;}

.flowwrap{overflow-x:auto;margin-bottom:10px;padding-bottom:10px;}
.flow{display:flex;gap:26px;min-width:max-content;padding:2px;}
.flow-phase{display:flex;flex-direction:column;gap:9px;}
.flow-phase .plabel{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--faint);}
.flow-nodes{display:flex;align-items:center;gap:3px;}
.node{width:33px;height:33px;border-radius:0;border:1px solid var(--rule);background:var(--form);
  color:var(--mut);font-family:var(--mono);font-size:12px;font-weight:500;cursor:pointer;
  display:grid;place-items:center;padding:0;transition:background .16s,color .16s,border-color .16s;}
.node:hover{border-color:var(--stamp);color:var(--stamp);}
.node[aria-current="true"]{background:var(--stamp);border-color:var(--stamp);color:var(--form);}
.node:focus-visible{outline:2px solid var(--stamp);outline-offset:2px;}
.arrow{color:var(--faint);font-size:11px;}

.tabs{display:inline-flex;gap:0;border:1px solid var(--rule);margin:26px 0 18px;background:var(--form);}
.tab{font:inherit;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  font-weight:500;padding:9px 16px;border:0;border-right:1px solid var(--rule);
  background:transparent;color:var(--mut);cursor:pointer;}
.tab:last-child{border-right:0;}
.tab[aria-selected="true"]{background:var(--ink);color:var(--paper);}
.tab:focus-visible{outline:2px solid var(--stamp);outline-offset:-3px;}
.toolbar{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;
  margin-bottom:16px;}
.toolbar .section-note{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--faint);}
.linkbtn{font:inherit;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  background:none;border:0;color:var(--stamp);cursor:pointer;padding:4px 0;font-weight:500;}
.linkbtn:focus-visible{outline:2px solid var(--stamp);outline-offset:2px;}

.phase-head{display:flex;align-items:center;gap:12px;margin:34px 0 10px;padding-bottom:7px;
  border-bottom:1px solid var(--rule);}
.phase-head:first-of-type{margin-top:0;}
.phase-head .letter{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--paper);
  background:var(--ink);width:21px;height:21px;display:grid;place-items:center;border-radius:0;}
.phase-head h3{font-family:var(--display);font-size:19px;font-weight:600;}
.phase-head .cnt{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--faint);margin-left:auto;}

.stage{overflow:hidden;margin-bottom:-1px;}
.stage.open{box-shadow:none;}
.stage-btn{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:0 15px;
  width:100%;padding:0;background:none;border:0;font:inherit;text-align:left;cursor:pointer;color:inherit;}
.stage-btn:focus-visible{outline:2px solid var(--stamp);outline-offset:-3px;}
/* Номер графы живёт в своей клетке, отчёркнутой линией, — как в бланке. */
.stage-n{font-family:var(--mono);font-size:14px;font-weight:500;color:var(--stamp);
  background:var(--stamp-soft);border-right:1px solid var(--rule);height:100%;min-height:58px;
  display:grid;place-items:center;border-radius:0;}
.stage-t{min-width:0;padding:14px 0;}
.stage-t b{display:block;font-family:var(--display);font-size:18px;font-weight:600;letter-spacing:-.01em;}
.stage-t span{display:block;font-size:12.5px;color:var(--faint);margin-top:2px;}
.chev{color:var(--faint);transition:transform .2s;flex:none;margin-right:16px;}
.stage.open .chev{transform:rotate(90deg);}
.stage-body{padding:4px 18px 22px 59px;display:grid;gap:18px;}
@media (max-width:620px){ .stage-body{padding-left:18px;} }
.what{font-size:15px;line-height:1.65;color:var(--mut);max-width:70ch;}
.what strong{color:var(--ink);font-weight:600;}

.block h4{font-family:var(--mono);font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;
  color:var(--faint);font-weight:500;margin:0 0 10px;padding-bottom:5px;
  border-bottom:1px solid var(--rule-soft);}
.steps li{position:relative;padding-left:17px;font-size:14px;color:var(--mut);margin-bottom:5px;
  line-height:1.5;}
.steps li::before{content:"";position:absolute;left:2px;top:9px;width:6px;height:1.5px;
  background:var(--stamp);opacity:.75;}
.docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:0;
  border:1px solid var(--rule-soft);}
.doc{background:transparent;padding:12px 14px;border-right:1px solid var(--rule-soft);
  border-bottom:1px solid var(--rule-soft);}
.doc b{display:block;font-size:13.5px;font-weight:600;line-height:1.35;}
.doc .by{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.08em;
  text-transform:uppercase;color:var(--stamp);margin:5px 0 6px;}
.doc .why{display:block;font-size:12.5px;color:var(--mut);line-height:1.45;}
.breaks{background:var(--seal-soft);padding:13px 15px;font-size:13.5px;line-height:1.55;
  border-left:2px solid var(--seal);}
.breaks b{color:var(--seal);font-weight:600;}
.verify{background:var(--warn-bg);border:0;border-left:2px solid var(--amber);padding:12px 15px;
  font-size:13px;color:var(--mut);line-height:1.5;}
.verify b{color:var(--amber);font-weight:600;}
.meta{display:flex;flex-wrap:wrap;gap:8px 26px;padding-top:13px;border-top:1px solid var(--rule-soft);}
.meta div{font-size:13px;color:var(--mut);}
.meta div b{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--faint);font-weight:500;margin-bottom:3px;}
.corridors{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border:1px solid var(--rule-soft);}
@media (max-width:620px){ .corridors{grid-template-columns:minmax(0,1fr);} }
.corr{padding:13px 15px;border-right:1px solid var(--rule-soft);}
.corr:last-child{border-right:0;}
.corr b{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;
  font-weight:700;margin-bottom:6px;}
.corr span{font-size:12.5px;line-height:1.45;display:block;color:var(--mut);}
.corr.g{background:var(--customs-soft);} .corr.g b{color:var(--customs);}
.corr.a{background:var(--amber-soft);} .corr.a b{color:var(--amber);}
.corr.r{background:var(--seal-soft);} .corr.r b{color:var(--seal);}

/* ─── страница 2: оси, направления, особые процедуры ─── */
.axes{display:grid;gap:-1px;}
.axis{padding:15px 18px;display:grid;grid-template-columns:168px minmax(0,1fr);gap:18px;
  align-items:center;margin-bottom:-1px;}
@media (max-width:640px){ .axis{grid-template-columns:minmax(0,1fr);gap:11px;} }
.axis .q{font-size:15px;font-weight:600;}
.axis .q span{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--stamp);font-weight:500;margin-bottom:4px;}
.opts{display:flex;flex-wrap:wrap;gap:6px;}
.opt{font-size:12.5px;padding:6px 11px;background:var(--sunk);color:var(--mut);
  border:1px solid var(--rule-soft);}
.opt b{color:var(--ink);font-weight:600;}

.dirs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border:1px solid var(--rule);}
@media (max-width:900px){ .dirs{grid-template-columns:minmax(0,1fr);} }
.dir{border:0;border-right:1px solid var(--rule);border-top:3px solid var(--dc);padding:20px;
  display:flex;flex-direction:column;gap:15px;}
.dir:last-child{border-right:0;}
.dir .code{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--dc);font-weight:500;}
.dir h3{font-family:var(--display);font-size:24px;font-weight:600;margin-top:5px;letter-spacing:-.015em;}
.dir .gist{font-size:13.5px;color:var(--mut);line-height:1.55;}
.dir h4{font-family:var(--mono);font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;
  color:var(--faint);font-weight:500;margin-bottom:9px;padding-bottom:5px;
  border-bottom:1px solid var(--rule-soft);}
.dir li{position:relative;padding-left:15px;font-size:13px;color:var(--mut);margin-bottom:6px;
  line-height:1.45;}
.dir li::before{content:"";position:absolute;left:1px;top:8px;width:5px;height:1.5px;background:var(--dc);}
.dir .pinch{margin-top:auto;background:var(--seal-soft);border-left:2px solid var(--seal);
  padding:11px 13px;font-size:12.5px;line-height:1.5;}
.dir .pinch b{color:var(--seal);font-weight:600;}

.callout{padding:24px 26px;display:grid;gap:14px;border-left:3px solid var(--stamp);}
.callout h3{font-family:var(--display);font-size:21px;font-weight:600;letter-spacing:-.012em;}
.callout p{font-size:15px;color:var(--mut);line-height:1.65;max-width:70ch;}
.callout strong{color:var(--ink);font-weight:600;}
.seq{display:flex;flex-wrap:wrap;gap:7px;align-items:stretch;}
.seq .st{background:var(--sunk);border:1px solid var(--rule-soft);padding:9px 12px;font-size:12.5px;
  color:var(--mut);}
.seq .st b{display:block;font-family:var(--mono);font-size:10px;color:var(--stamp);font-weight:700;
  margin-bottom:2px;}
.seq .ar{color:var(--faint);align-self:center;}

.special{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border:1px solid var(--rule);}
@media (max-width:900px){ .special{grid-template-columns:minmax(0,1fr);} }
.sp{border:0;border-right:1px solid var(--rule);padding:18px;}
.sp:last-child{border-right:0;}
.sp b{display:block;font-family:var(--display);font-size:17px;font-weight:600;margin-bottom:7px;}
.sp p{font-size:13px;color:var(--mut);line-height:1.5;}

/* ─── таблицы ─── */
.tablewrap{overflow-x:auto;}
table{border-collapse:collapse;width:100%;min-width:740px;}
thead th{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--faint);font-weight:500;text-align:left;padding:13px 16px;
  border-bottom:1px solid var(--rule);vertical-align:bottom;}
tbody td{padding:13px 16px;font-size:13.5px;vertical-align:top;border-bottom:1px solid var(--rule-soft);
  color:var(--mut);line-height:1.45;}
tbody tr:last-child td{border-bottom:0;}
td.head,tbody td.name{color:var(--ink);font-weight:600;}
td.head{width:19%;}
tbody td.name{width:26%;}
td.head small{display:block;font-family:var(--mono);font-size:10px;font-weight:400;color:var(--faint);
  margin-top:4px;letter-spacing:.04em;}
tbody td.by{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;color:var(--stamp);width:20%;}
tbody td.at{font-family:var(--mono);font-size:11px;width:9%;color:var(--faint);}
.pill{display:inline-block;font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;
  text-transform:uppercase;padding:4px 8px;white-space:nowrap;font-weight:500;}
.pill.g{background:var(--customs-soft);color:var(--customs);}
.pill.a{background:var(--amber-soft);color:var(--amber);}
.pill.r{background:var(--seal-soft);color:var(--seal);}
.pill.n{background:var(--sunk);color:var(--mut);}

/* ─── страница 3: простой разбор ─── */
.bit{padding-block:32px;border-bottom:1px solid var(--rule-soft);margin-bottom:0;}
.bit:last-of-type{border-bottom:0;}
.bit h2{font-size:27px;margin-bottom:15px;}
.bit p{font-size:16.5px;line-height:1.7;color:var(--mut);}
.bit p + p{margin-top:15px;}
.bit strong{color:var(--ink);font-weight:600;}
.term{margin-top:19px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;
  align-items:baseline;background:var(--sunk);border-left:2px solid var(--stamp);padding:13px 16px;}
@media (max-width:560px){ .term{grid-template-columns:minmax(0,1fr);gap:5px;} }
.term .k{font-family:var(--mono);font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;
  color:var(--stamp);font-weight:500;}
.term .v{font-size:14px;color:var(--mut);line-height:1.55;}
.term .v b{color:var(--ink);font-weight:600;}
.path{margin-top:22px;display:grid;border:1px solid var(--rule);}
.path li{display:grid;grid-template-columns:46px minmax(0,1fr);gap:0 16px;align-items:baseline;
  padding:13px 16px 13px 0;border-bottom:1px solid var(--rule-soft);}
.path li:last-child{border-bottom:0;}
.path .num{font-family:var(--mono);font-size:13px;color:var(--stamp);font-weight:500;text-align:center;}
.path .txt{font-size:15.5px;line-height:1.55;color:var(--mut);}
.path .txt b{color:var(--ink);font-weight:600;display:block;margin-bottom:2px;font-size:15.5px;}
.bill{margin-top:22px;}
.bill .bh{padding:15px 18px;border-bottom:1px solid var(--rule);font-family:var(--display);
  font-size:17px;font-weight:600;}
.bill .bh span{display:block;font-family:var(--mono);font-size:10.5px;font-weight:400;
  color:var(--faint);margin-top:5px;letter-spacing:.03em;}
.bill .row{display:flex;justify-content:space-between;gap:16px;padding:11px 18px;font-size:14.5px;
  color:var(--mut);border-bottom:1px solid var(--rule-soft);}
.bill .row .n{font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap;}
.bill .row.sub{background:var(--sunk);color:var(--ink);font-weight:600;}
.bill .row.tot{background:var(--ink);color:var(--paper);font-weight:600;font-size:16px;border-bottom:0;}
.bill .row.tot .n{color:var(--paper);}
.bill .row small{display:block;font-family:var(--mono);font-size:10.5px;color:var(--faint);
  font-weight:400;margin-top:3px;}
.note{margin-top:19px;padding:14px 16px;font-size:14.5px;line-height:1.6;}
.note.warn{background:var(--seal-soft);border-left:2px solid var(--seal);}
.note.warn b{color:var(--seal);font-weight:600;}
.note.ok{background:var(--customs-soft);border-left:2px solid var(--customs);}
.note.ok b{color:var(--customs);font-weight:600;}
.cast{margin-top:22px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;
  border:1px solid var(--rule);}
@media (max-width:560px){ .cast{grid-template-columns:minmax(0,1fr);} }
.cast div{padding:13px 16px;border-bottom:1px solid var(--rule-soft);border-right:1px solid var(--rule-soft);}
.cast div:nth-child(2n){border-right:0;}
.cast b{display:block;font-size:14.5px;font-weight:600;margin-bottom:3px;}
.cast span{font-size:14px;color:var(--mut);line-height:1.5;}
.gloss{margin-top:22px;display:grid;border:1px solid var(--rule);}
.gloss div{display:grid;grid-template-columns:168px minmax(0,1fr);gap:16px;padding:12px 16px;
  border-bottom:1px solid var(--rule-soft);}
.gloss div:last-child{border-bottom:0;}
@media (max-width:560px){ .gloss div{grid-template-columns:minmax(0,1fr);gap:3px;} }
.gloss b{font-family:var(--mono);font-size:12.5px;font-weight:500;letter-spacing:.04em;color:var(--stamp);}
.gloss span{font-size:14.5px;color:var(--mut);line-height:1.55;}
.more{margin-top:42px;padding:24px 26px;}
.more h3{font-family:var(--display);font-size:20px;font-weight:600;margin-bottom:9px;}
.more p{font-size:14.5px;color:var(--mut);line-height:1.6;}
.more ul{margin-top:15px;display:grid;gap:10px;}
.more li{font-size:14.5px;}
.more a{color:var(--stamp);font-weight:600;text-decoration:none;
  border-bottom:1px solid var(--stamp-soft);}
.more a:hover{border-bottom-color:currentColor;}
.more li span{color:var(--faint);}

.foot{margin-top:38px;padding-top:20px;border-top:2px solid var(--ink);font-size:13px;
  color:var(--faint);line-height:1.6;max-width:74ch;}
.foot b{color:var(--mut);font-weight:600;}

@media (prefers-reduced-motion: reduce){ *{transition:none!important;animation:none!important;} }
"""

FILES = {
    "customs-pipeline.html": stamp("ТАМОЖЕННЫЙ ОРГАН · ЕАЭС · KZ", "ВЫПУСК", "РАЗРЕШЁН", "violet"),
    "kz-borders.html": stamp("ПОД ТАМОЖЕННЫМ КОНТРОЛЕМ · ЕАЭС", "ТРАНЗИТ", "ОТКРЫТ", "violet"),
    "customs-simple.html": stamp("СИСТЕМА УПРАВЛЕНИЯ РИСКАМИ · KZ", "ЗЕЛЁНЫЙ", "КОРИДОР", "green"),
}

here = pathlib.Path(__file__).parent
css = CSS.replace("GUILLOCHE", guilloche())

for name, mark in FILES.items():
    p = here / name
    s = p.read_text(encoding="utf-8")
    s = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis[^"]*">', FONTS, s)
    s = re.sub(r"<style>.*?</style>", "<style>" + css + "</style>", s, count=1, flags=re.S)
    # Штемпель ставится в шапку — там же, где на бланке.
    s = s.replace('<header class="masthead">', '<header class="masthead">\n    ' + mark, 1)
    p.write_text(s, encoding="utf-8")
    print(f"{name}: перекрашено, штемпель поставлен")
