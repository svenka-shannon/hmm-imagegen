# Data sources and licenses

## `freq-top.json` (3000 entries)

Derived from `hanziDB.csv`, which is itself based on Jun Da's "Modern Chinese Character Frequency List" (https://lingua.mtsu.edu/chinese-computing/statistics/char/list.php).

Source repo: [ruddfawcett/hanziDB.csv](https://github.com/ruddfawcett/hanziDB.csv)
License: **CC-BY-SA 4.0**

Each entry contains:

- `freqRank` — 1-based rank, where 1 is most common
- `hanzi` — simplified character
- `pinyin` — tone-marked pinyin
- `meaning` — short English gloss
- `hsk` — HSK level (1-6) when applicable
- `strokeCount`
- `radical`

## `heisig.json` (3019 entries)

Derived from `rsh.xml`, James W. Heisig & Timothy W. Richardson's "Remembering the Simplified Hanzi" (RSH/RTH) frame order.

Source repo: [rouseabout/heisig](https://github.com/rouseabout/heisig) (XML transcription)
Underlying work: Heisig, J.W. and Richardson, T.W., *Remembering Simplified Hanzi*, University of Hawai'i Press, 2008. ISBN 978-0-8248-3323-7.

Each entry contains:

- `heisigNum` — 1-based frame number from the book
- `hanzi` — simplified character
- `keyword` — Heisig's English keyword for that frame
- `strokes` — stroke count
- `pinyin` (hydrated from `freq-top.json` where available)
- `meaning` (hydrated from `freq-top.json` where available)

**Note on usage**: Heisig's keywords are copyrighted. We include them here for tooling purposes (so the deck-generation step can render `meaning` cards in Heisig order). If you redistribute this data publicly you should comply with fair-use / quotation norms; we do not claim license to the keywords.

## CC-CEDICT

Some scripts in this repo also use [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) for additional dictionary lookups. CC-CEDICT is licensed **CC-BY-SA 4.0**. The `cedict.txt` file itself is not checked in (too large + auto-fetched on demand).
