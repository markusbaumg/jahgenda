# Display face

`jahdisplay.woff2` is **Anton** (Regular, v27) by Vernon Adams, SIL Open Font License 1.1 (see `OFL.txt`),
subset to Latin-1 plus dashes, bullet and ellipsis (U+0020-007E, U+00A0-00FF, U+2013-2014, U+2022, U+2026),
about 9 KB. It is the `--font-display` token in `style.css` (wordmark, day numbers, month heads, pills,
empty-state headline, count badge) and is preloaded from `index.html` / `log.html`. A size-adjusted
`@font-face` fallback against Impact / Arial Narrow keeps the layout stable while it loads.

Rebuild (fontTools):

```sh
pyftsubset Anton-Regular.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2022,U+2026" \
  --flavor=woff2 --layout-features='*' --output-file=jahdisplay.woff2
```
