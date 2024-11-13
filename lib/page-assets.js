export const FAVICON_ERROR = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
style="color-scheme: light dark; fill: light-dark(#333, #ccc)">
<path fill-rule="evenodd" d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Zm0 1.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z M9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM7 5a1 1 0 0 1 2 0v3a1 1 0 0 1-2 0V5Z"/>
</svg>`;

export const FAVICON_LIST = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
style="color-scheme: light dark; fill: light-dark(#333, #ccc)">
<rect x="1" y="2.75" width="2" height="2" rx="1"/>
<rect x="1" y="7.25" width="2" height="2" rx="1"/>
<rect x="1" y="11.75" width="2" height="2" rx="1"/>
<rect x="5" y="3" width="8.5" height="1.5" rx="0.75"/>
<rect x="5" y="7.5" width="10" height="1.5" rx="0.75"/>
<rect x="5" y="12" width="7" height="1.5" rx="0.75"/>
</svg>`;

export const ICONS = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" style="position:absolute;pointer-events:none">
<symbol id="icon-dir" viewBox="0 0 20 20">
<path d="M8.886 3.658A.5.5 0 0 0 9.36 4H17a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h3.558a2 2 0 0 1 1.898 1.368l.43 1.29ZM3 16.5h14a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.5-.5H9.36a2 2 0 0 1-1.897-1.368l-.43-1.29a.5.5 0 0 0-.475-.342H3a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5Z"/>
</symbol>
<symbol id="icon-dir-link" viewBox="0 0 20 20">
<path d="M8.886 3.658A.5.5 0 0 0 9.36 4H17a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h3.558a2 2 0 0 1 1.898 1.368l.43 1.29ZM3 16.5h14a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.5-.5H9.36a2 2 0 0 1-1.897-1.368l-.43-1.29a.5.5 0 0 0-.475-.342H3a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5Z M7.5 9.75a.75.75 0 0 0-1.5 0V11a2 2 0 0 0 2 2h3v1a.5.5 0 0 0 .812.39l2.5-2a.5.5 0 0 0 0-.78l-2.5-2A.5.5 0 0 0 11 10v1.5H8a.5.5 0 0 1-.5-.5V9.75Z"/>
</symbol>
<symbol id="icon-file" viewBox="0 0 20 20">
<path fill-rule="evenodd" d="M9.5 6.75V2.5H4a.5.5 0 0 0-.5.5v14a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5V8.5h-5.25A1.75 1.75 0 0 1 9.5 6.75ZM11 2.976V6.75c0 .138.112.25.25.25h4.445L11 2.976ZM2 3v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.92a2 2 0 0 0-.698-1.519l-5.74-4.92A2 2 0 0 0 10.26 1H4a2 2 0 0 0-2 2Z"/>
</symbol>
<symbol id="icon-file-link" viewBox="0 0 20 20">
<path fill-rule="evenodd" d="M9.5 6.75V2.5H4a.5.5 0 0 0-.5.5v14a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5V8.5h-5.25A1.75 1.75 0 0 1 9.5 6.75ZM11 2.976V6.75c0 .138.112.25.25.25h4.445L11 2.976ZM2 3v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.92a2 2 0 0 0-.698-1.519l-5.74-4.92A2 2 0 0 0 10.26 1H4a2 2 0 0 0-2 2Z M7.5 10.75a.75.75 0 0 0-1.5 0V12a2 2 0 0 0 2 2h3v1a.5.5 0 0 0 .812.39l2.5-2a.5.5 0 0 0 0-.78l-2.5-2A.5.5 0 0 0 11 11v1.5H8a.5.5 0 0 1-.5-.5v-1.25Z"/>
</symbol>
</svg>`;

export const STYLES = `@property --max-col-count {
syntax: '<integer>';
inherits: true;
initial-value: 4;
}
* {
box-sizing: border-box;
}
:root {
--bg-base: hsl(0 0% 98%);
--text-base: hsl(0 0% 8%);
--text-secondary: hsl(0 0% 28%);
--text-highlight: hsl(330 60% 33%);
--text-link: hsl(210 85% 40%);
--border-dim: hsl(0 0% 80%);
color: var(--text-base);
background-color: var(--bg-base);
tab-size: 4;
}
@media (prefers-contrast: more) {
:root {
--bg-base: hsl(0 0% 98%);
--text-base: hsl(0 0% 4%);
--text-secondary: hsl(0 0% 16%);
--text-highlight: hsl(330, 70%, 28%);
--text-link: hsl(210, 86%, 30%);
--border-dim: hsl(0 0% 40%);
}
}
body {
margin: 0;
padding: 1.5rem;
line-height: 1.5;
font-family: system-ui, sans-serif;
}
@media (min-width: 40em) {
body {
padding: 3rem 3.5rem;
}
}
h1 {
margin-block: 0 1.5rem;
font-size: 1.125rem;
font-weight: 500;
line-height: 1.5;
}
p {
margin-block: 0;
padding-block: 0.5rem;
color: var(--text-secondary);
}
code {
font-size-adjust: ex-height 0.525;
font-family: ui-monospace, monospace;
font-size: 100%;
color: var(--text-highlight);
}
.filepath {
white-space-collapse: preserve;
word-break: break-word;
hyphenate-character: '';
}
code.filepath {
border: solid 1px #ccc;
padding: 2px 4px;
border-radius: 4px;
margin-inline: 2px;
}
.bc-current,
.bc-link {
padding: 4px 2px;
border-radius: 4px;
color: inherit;
}
.bc-link {
text-decoration: underline;
text-decoration-thickness: 1px;
text-decoration-color: #ccc;
text-underline-offset: 6px;
}
.bc-link:hover {
color: var(--text-link);
text-decoration-color: currentColor;
}
.bc-link:focus-visible {
color: var(--text-link);
outline: solid 2px currentColor;
outline-offset: -2px;
}
.bc-sep {
font-weight: 400;
opacity: 0.5;
}
.files {
margin-block: 1rem;
margin-inline: -0.75rem;
padding-inline: 0;
list-style: none;
font-variant-numeric: tabular-nums;
}
/*
tweaking font sizes to fractional sizes may defeat font hinting,
which could look bad on low resolution screens
*/
@media (min-resolution: 1.5x) {
.files {
font-size: 0.96875rem;
}
}
@media (min-width: 40em) {
.files {
max-width: max(30rem, var(--max-col-count) * 22.5rem + calc(var(--max-col-count) - 1) * 1rem);
column-count: var(--max-col-count);
column-width: 22.5rem;
column-gap: 1rem;
}
}
.files-item {
max-width: 30rem;
break-inside: avoid;
}
.files-link {
--icon-opacity: 0.8;
display: flex;
gap: 0.75rem;
align-items: center;
min-height: 2.5rem;
border-radius: 4px;
padding: 0.375rem 0.75rem;
line-height: 1.125rem;
color: var(--text-base);
}
.files-link:not(:hover) {
text-decoration: none;
}
.files-link:hover {
--icon-opacity: 1;
color: var(--text-link);
}
.files-link:focus-visible {
--icon-opacity: 1;
color: var(--text-link);
outline: solid 2px currentColor;
outline-offset: -2px;
}
.files-icon {
flex: none;
fill: currentColor;
opacity: var(--icon-opacity);
}
.files-name {
display: block;
}
.files-link[aria-label*='parent' i] .files-name {
letter-spacing: 0.15ch;
}
.files-name > span {
margin-inline-start: 0.2ch;
}
@media (prefers-contrast: no-preference) {
.files-name > span {
opacity: 0.6;
}
}`;
