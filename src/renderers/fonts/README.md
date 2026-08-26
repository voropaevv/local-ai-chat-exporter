# Bundled PDF fonts

Jelluvi embeds local subsets of Noto Sans Regular, Noto Sans Bold, Noto Sans Mono Regular, and
Noto Emoji Regular in PDF exports. The fonts are never fetched at runtime.

Sources:

- `https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf`
- `https://github.com/google/fonts/tree/main/ofl/notoemoji`

Original SHA256 values:

- `NotoSans-Regular.ttf`: `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`
- `NotoSans-Bold.ttf`: `c976e4b1b99edc88775377fcc21692ca4bfa46b6d6ca6522bfda505b28ff9d6a`
- `NotoSansMono-Regular.ttf`: `d9e2b23d19f8230be7146f409a52b1d23117e635e28f2e2892cf91b7382f325b`
- `NotoEmoji[wght].ttf`: `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551`

The bundled files retain the glyphs available in their source fonts for common Latin, Greek,
Cyrillic, punctuation, currency, arrows, mathematical operators, geometric shapes, and the
replacement character. They are produced with FontTools using this base Unicode selection:

`U+0020-024F,U+0300-052F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-22FF,U+25A0-25FF,U+FFFD`

The monospaced subset additionally retains `U+2500-257F` so code blocks can render Unicode box
drawing characters such as `├──`, `│`, and `└──` without replacement glyphs.

The emoji source is instantiated at weight 400 and retains its complete Unicode cmap. It provides
monochrome vector fallback glyphs for common standalone emoji; complex joined emoji sequences are
preserved as code points but may render as separate components.

The selection is an upper bound: it cannot add glyphs missing from an original font. PDF text uses
the bundled monospace font as a per-glyph fallback when Regular or Bold lacks a selected symbol, so
operators such as `≤`, `≥`, and `≠` remain intact instead of becoming replacement characters.

The subsets retain layout features, names, symbol and legacy cmaps, and the recommended/notdef
glyphs. Hinting is removed because PDF viewers render the vector outlines directly. Each subset is
then compressed with zlib level 9 so extension pages do not carry raw font bytes.

Bundled SHA256 values:

- `NotoSans-Regular.ttf.zlib`: `a92af109a3bd24b823bb25b0cba89c750a4cb3b7b8b9e2584c52ac49b9560970`
- `NotoSans-Bold.ttf.zlib`: `7999bb19345d20822d9bd5f86d0a13be44d42aadde8578860f946ac9329a8409`
- `NotoSansMono-Regular.ttf.zlib`: `02d4e5af037ad891618deb00df30d96260a318e94f3fa474a83f2f68c8e42fe7`
- `NotoEmoji-Regular.ttf.zlib`: `8bece29d464172e2c4c1e00a0a932bf2cfe9b12ee0e2102db4a41eed4104114b`

License: SIL Open Font License 1.1. See `OFL.txt` and the project-level
`THIRD_PARTY_NOTICES.md`.
