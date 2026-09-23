import { useId } from "react";

import styles from "./NovaOrb.module.css";

type NovaOrbProps = {
  variant?: "hero" | "mini" | "nav";
  size?: number | string;
  className?: string;
};

/** Decorative, scalable Nova mark. Text and accessible name belong to its parent control. */
export function NovaOrb({ variant = "hero", size, className }: NovaOrbProps) {
  const id = useId().replace(/:/g, "");
  const prefix = `nova-${id}`;

  return (
    <span
      className={[styles.orb, variant === "hero" ? styles.hero : styles.nav, className].filter(Boolean).join(" ")}
      style={size === undefined ? undefined : { width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 300 300" fill="none" focusable="false" className={styles.art}>
        <defs>
          <radialGradient id={`${prefix}-body`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(117 97) rotate(62) scale(182)">
            <stop stopColor="#103B69" />
            <stop offset=".42" stopColor="#082139" />
            <stop offset=".76" stopColor="#07121F" />
            <stop offset="1" stopColor="#03080E" />
          </radialGradient>
          <radialGradient id={`${prefix}-void`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(150 152) rotate(90) scale(95)">
            <stop stopColor="#020912" />
            <stop offset=".65" stopColor="#041322" />
            <stop offset="1" stopColor="#0C3560" stopOpacity=".15" />
          </radialGradient>
          <radialGradient id={`${prefix}-shadow`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(150 149) rotate(90) scale(99)">
            <stop stopColor="#020912" stopOpacity=".87" />
            <stop offset=".4" stopColor="#03111F" stopOpacity=".7" />
            <stop offset=".72" stopColor="#071D33" stopOpacity=".2" />
            <stop offset="1" stopColor="#071D33" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${prefix}-iris`} x1="39" y1="77" x2="272" y2="222" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1457C8" stopOpacity=".06" />
            <stop offset=".25" stopColor="#55B7FF" stopOpacity=".65" />
            <stop offset=".53" stopColor="var(--ac)" stopOpacity=".18" />
            <stop offset=".77" stopColor="#46C6F5" stopOpacity=".62" />
            <stop offset="1" stopColor="#285DDA" stopOpacity=".08" />
          </linearGradient>
          <linearGradient id={`${prefix}-ribbon-a`} x1="18" y1="60" x2="261" y2="217" gradientUnits="userSpaceOnUse">
            <stop stopColor="#103C91" stopOpacity="0" />
            <stop offset=".22" stopColor="var(--ac)" stopOpacity=".72" />
            <stop offset=".48" stopColor="#53D6FF" stopOpacity=".18" />
            <stop offset=".72" stopColor="#266BF2" stopOpacity=".74" />
            <stop offset="1" stopColor="#4CC9FF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${prefix}-ribbon-b`} x1="244" y1="20" x2="65" y2="275" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7CDBFF" stopOpacity=".74" />
            <stop offset=".31" stopColor="#157DE7" stopOpacity=".32" />
            <stop offset=".58" stopColor="#54AFFF" stopOpacity=".8" />
            <stop offset="1" stopColor="#1540AA" stopOpacity=".04" />
          </linearGradient>
          <linearGradient id={`${prefix}-wire`} x1="56" y1="72" x2="258" y2="228" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1555B7" stopOpacity=".04" />
            <stop offset=".2" stopColor="#69B7FF" stopOpacity=".86" />
            <stop offset=".49" stopColor="#93E8FF" stopOpacity=".7" />
            <stop offset=".7" stopColor="var(--ac)" stopOpacity=".8" />
            <stop offset="1" stopColor="#50B8FF" stopOpacity=".08" />
          </linearGradient>
          <radialGradient id={`${prefix}-rim`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(150 150) rotate(90) scale(112)">
            <stop offset=".76" stopColor="#020A14" stopOpacity="0" />
            <stop offset=".93" stopColor="var(--ac)" stopOpacity=".32" />
            <stop offset="1" stopColor="#78C9FF" stopOpacity=".78" />
          </radialGradient>
          <radialGradient id={`${prefix}-spark`} cx="0" cy="0" r="1" gradientTransform="translate(0 0) rotate(90) scale(1)">
            <stop stopColor="white" />
            <stop offset=".25" stopColor="#B7EEFF" />
            <stop offset="1" stopColor="var(--ac)" stopOpacity="0" />
          </radialGradient>
          <filter id={`${prefix}-blur`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="11" />
          </filter>
          <filter id={`${prefix}-soft`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <clipPath id={`${prefix}-clip`}><circle cx="150" cy="150" r="105" /></clipPath>
        </defs>

        <circle cx="150" cy="150" r="112" fill="var(--ac)" opacity=".3" filter={`url(#${prefix}-blur)`} />
        <circle cx="150" cy="150" r="105" fill={`url(#${prefix}-body)`} />
        <g clipPath={`url(#${prefix}-clip)`}>
          <g className={styles.backVeil}>
            <path d="M25 120C64 116 53 50 115 59C150 63 145 30 181 44C213 57 211 107 262 93L269 133C229 149 216 79 176 83C148 85 124 95 115 128C102 178 57 168 25 158Z" fill={`url(#${prefix}-ribbon-a)`} opacity=".75" />
            <path d="M195 24C223 46 192 67 219 91C246 115 267 88 286 131L274 198C237 184 245 159 215 148C179 134 190 104 178 91C160 70 171 43 195 24Z" fill={`url(#${prefix}-ribbon-b)`} opacity=".64" />
            <path d="M18 172C65 130 107 168 130 196C152 222 188 178 218 198C241 213 253 247 275 242L236 277C208 268 189 242 159 250C109 264 86 224 50 240Z" fill={`url(#${prefix}-ribbon-a)`} opacity=".7" />
          </g>

          <circle cx="150" cy="151" r="85" fill={`url(#${prefix}-void)`} />

          <g className={styles.waveOne}>
            <path d="M23 153C69 191 91 122 123 134C150 145 115 194 150 207C189 222 186 169 222 175C251 180 250 206 280 185L271 243C241 272 214 211 186 230C144 258 120 225 113 190C108 168 91 166 76 185C56 211 30 200 23 153Z" fill={`url(#${prefix}-ribbon-b)`} opacity=".62" />
            <path d="M35 124C79 155 95 103 130 109C165 116 159 146 180 147C214 147 202 85 254 101L274 145C232 123 235 172 199 174C164 178 164 134 134 132C96 128 79 184 35 160Z" fill={`url(#${prefix}-iris)`} opacity=".8" />
            <path d="M21 165C66 182 90 156 109 160C144 167 133 212 163 212C194 210 195 173 231 183C249 188 262 207 283 196" stroke={`url(#${prefix}-wire)`} strokeWidth="5" opacity=".4" filter={`url(#${prefix}-soft)`} />
            <path d="M21 165C66 182 90 156 109 160C144 167 133 212 163 212C194 210 195 173 231 183C249 188 262 207 283 196" stroke={`url(#${prefix}-wire)`} strokeWidth=".9" opacity=".83" />
          </g>

          <g className={styles.waveTwo}>
            <path d="M47 49C89 47 106 76 127 65C146 57 158 32 192 36C230 42 213 81 250 102C273 114 286 88 299 87L287 142C249 132 251 116 222 95C194 77 180 65 164 92C142 126 104 81 86 104C62 131 48 104 47 49Z" fill={`url(#${prefix}-ribbon-a)`} opacity=".76" />
            <path d="M80 254C98 225 92 196 121 193C156 190 157 246 189 236C221 224 226 197 264 203L276 259L220 278C196 271 184 260 162 265C125 271 111 235 80 254Z" fill={`url(#${prefix}-ribbon-b)`} opacity=".75" />
            <path d="M51 116C80 95 89 62 119 76C146 89 159 53 183 59C211 65 205 105 248 118" stroke={`url(#${prefix}-wire)`} strokeWidth="4" opacity=".4" filter={`url(#${prefix}-soft)`} />
            <path d="M51 116C80 95 89 62 119 76C146 89 159 53 183 59C211 65 205 105 248 118" stroke={`url(#${prefix}-wire)`} strokeWidth="1.25" opacity=".82" />
            <path d="M77 231C102 217 95 183 123 183C150 183 148 229 182 229C213 229 213 198 259 216" stroke={`url(#${prefix}-wire)`} strokeWidth="1.1" opacity=".7" />
          </g>

          <circle cx="150" cy="149" r="99" fill={`url(#${prefix}-shadow)`} />
          <path d="M37 144C57 127 66 176 90 157C109 140 100 101 128 91C151 83 168 99 179 108C197 124 205 90 225 100C250 111 251 134 272 144" stroke={`url(#${prefix}-wire)`} strokeWidth=".75" opacity=".65" />
          <path d="M49 186C85 210 94 177 119 177C143 177 136 221 170 238C192 249 218 223 249 230" stroke={`url(#${prefix}-wire)`} strokeWidth=".7" opacity=".53" />
          <path className={styles.signal} d="M44 127C73 99 101 63 130 78C164 95 163 43 196 56C228 69 219 116 259 141C284 157 254 218 219 242C188 261 143 254 116 237C77 211 58 237 39 204" stroke={`url(#${prefix}-wire)`} strokeWidth="2.3" strokeLinecap="round" strokeDasharray="21 590" />
          <path className={styles.signalSecond} d="M53 183C80 199 93 141 120 151C155 164 139 211 176 219C210 226 214 164 249 178C272 187 240 227 224 240" stroke={`url(#${prefix}-wire)`} strokeWidth="1.65" strokeLinecap="round" strokeDasharray="14 360" />
          <circle cx="150" cy="150" r="105" fill={`url(#${prefix}-rim)`} opacity=".48" />
        </g>

        <circle cx="150" cy="150" r="104.5" stroke={`url(#${prefix}-wire)`} strokeWidth="1.15" opacity=".66" />
        <path d="M78 69C118 37 157 41 182 47M226 73C248 94 255 113 257 133M239 211C221 240 196 255 167 258M66 205C46 177 39 146 47 119" stroke={`url(#${prefix}-wire)`} strokeWidth="1.3" strokeLinecap="round" opacity=".85" />

        <g className={styles.sparks}>
          <circle cx="209" cy="56" r="16" fill={`url(#${prefix}-spark)`} opacity=".77" filter={`url(#${prefix}-soft)`} />
          <circle cx="209" cy="56" r="3.1" fill="#ECFAFF" />
          <path d="M209 45V67M198 56H220" stroke="#D2F3FF" strokeWidth=".7" strokeLinecap="round" />
          <circle cx="244" cy="111" r="8" fill={`url(#${prefix}-spark)`} opacity=".62" />
          <circle cx="244" cy="111" r="1.8" fill="#E7F9FF" />
          <circle cx="91" cy="215" r="8" fill={`url(#${prefix}-spark)`} opacity=".6" />
          <circle cx="91" cy="215" r="1.8" fill="#D6F1FF" />
          <circle cx="71" cy="89" r="5" fill={`url(#${prefix}-spark)`} opacity=".65" />
        </g>
      </svg>
    </span>
  );
}
