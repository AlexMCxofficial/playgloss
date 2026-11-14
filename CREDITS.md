# Credits

PlayGloss itself is MIT licensed (see `LICENSE`). Everything below is third-party and keeps its own license.

## Shipped with the game

### Word meanings: Princeton WordNet 3.0

The questions in `web/js/words.js` are generated from WordNet (words and their definitions).
WordNet is not MIT licensed; its notice must stay with every copy that includes it:

> WordNet Release 3.0
>
> This software and database is being provided to you, the LICENSEE, by Princeton University under the following license. By obtaining, using and/or copying this software and database, you agree that you have read, understood, and will comply with these terms and conditions.
>
> Permission to use, copy, modify and distribute this software and database and its documentation for any purpose and without fee or royalty is hereby granted, provided that you agree to comply with the following copyright notice and statements, including the disclaimer, and that the same appear on ALL copies of the software, database and documentation, including modifications that you make for internal use or for distribution.
>
> WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.
>
> THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.
>
> The name of Princeton University or Princeton may not be used in advertising or publicity pertaining to distribution of the software and/or database. Title to copyright in this software, database and any associated documentation shall at all times remain with Princeton University and LICENSEE agrees to preserve same.

Source: https://wordnet.princeton.edu/

## Build tools only (not shipped with the game)

- NLTK (Apache 2.0): reads WordNet in `tools/build_words.py`
- better-profanity (MIT): filters offensive words in `tools/build_words.py`

## Original work

The wheel, rules, interface and Easter egg are original to PlayGloss (MIT, AlexMC).
