# Token-savings benchmark summary

Generated 2026-09-29T17:43:01.517Z. Spent $5.69 across 32 recorded steps and 0 aborted steps.

## Medians over successful sessions (create and revise both passed)

| Task | Cond | Sessions | Passed | Out create | Out revise | Out total | $ create | $ revise | $ total | In-side total | Turns total | Wall s total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | A | 2 | 2 | 2,072 | 1,606 | 3,678 | 0.13 | 0.12 | 0.25 | 139,100 | 16 | 47 |
| t1 | B | 2 | 2 | 2,269 | 1,106 | 3,375 | 0.22 | 0.09 | 0.31 | 273,902 | 21 | 62 |
| t2 | A | 2 | 2 | 3,580 | 1,126 | 4,706 | 0.16 | 0.05 | 0.21 | 113,649 | 11 | 63 |
| t2 | B | 2 | 2 | 5,583 | 1,935 | 7,518 | 0.43 | 0.15 | 0.57 | 605,039 | 27 | 693 |
| t3 | A | 2 | 2 | 10,097 | 1,399 | 11,496 | 0.42 | 0.09 | 0.52 | 358,521 | 19 | 340 |
| t3 | B | 2 | 2 | 6,722 | 1,973 | 8,695 | 0.46 | 0.13 | 0.59 | 563,063 | 24 | 223 |
| t4 | A | 2 | 2 | 2,528 | 992 | 3,519 | 0.14 | 0.04 | 0.18 | 107,755 | 14 | 44 |
| t4 | B | 2 | 2 | 2,077 | 1,132 | 3,209 | 0.15 | 0.06 | 0.21 | 148,447 | 13 | 44 |

## B / A ratio of medians (below 1 means SlopCamera used less)

| Task | Passed A | Passed B | Out create | Out revise | Out total | $ create | $ revise | $ total |
|---|---|---|---|---|---|---|---|---|
| t1 | 2 | 2 | 1.09 | 0.69 | 0.92 | 1.69 | 0.76 | 1.23 |
| t2 | 2 | 2 | 1.56 | 1.72 | 1.60 | 2.60 | 2.98 | 2.69 |
| t3 | 2 | 2 | 0.67 | 1.41 | 0.76 | 1.07 | 1.43 | 1.14 |
| t4 | 2 | 2 | 0.82 | 1.14 | 0.91 | 1.11 | 1.56 | 1.21 |

## Failures

None.

## All steps

| Key | Step | Status | Pass | In-side | Out | $ | Turns | Wall s | slopcamera cmds | Skill calls | Tools |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t1-A-r1 | create | ok | yes | 56,760 | 2,144 | 0.13 | 8 | 24 | 0 | 0 | Read×3 Bash×2 |
| t1-A-r1 | revise | ok | yes | 54,031 | 1,159 | 0.07 | 6 | 14 | 0 | 0 | Bash×1 Read×2 |
| t1-A-r2 | create | ok | yes | 56,845 | 2,000 | 0.13 | 6 | 26 | 0 | 0 | Bash×3 Read×2 |
| t1-A-r2 | revise | ok | yes | 110,564 | 2,052 | 0.17 | 12 | 30 | 0 | 0 | Bash×3 Read×6 |
| t1-B-r1 | create | ok | yes | 166,579 | 2,324 | 0.22 | 14 | 44 | 4 | 1 | Bash×7 Skill×1 Read×2 |
| t1-B-r1 | revise | ok | yes | 113,392 | 1,022 | 0.10 | 7 | 20 | 1 | 0 | Bash×2 Read×2 |
| t1-B-r2 | create | ok | yes | 165,712 | 2,213 | 0.21 | 14 | 39 | 4 | 1 | Bash×7 Skill×1 Read×2 |
| t1-B-r2 | revise | ok | yes | 102,121 | 1,190 | 0.09 | 7 | 21 | 1 | 0 | Bash×2 Read×2 |
| t2-A-r1 | create | ok | yes | 83,279 | 4,286 | 0.18 | 9 | 58 | 0 | 0 | Bash×6 Read×2 |
| t2-A-r1 | revise | ok | yes | 35,327 | 897 | 0.04 | 3 | 19 | 0 | 0 | Bash×1 Read×1 |
| t2-A-r2 | create | ok | yes | 73,674 | 2,873 | 0.15 | 7 | 33 | 0 | 0 | Bash×5 Read×1 |
| t2-A-r2 | revise | ok | yes | 35,017 | 1,355 | 0.05 | 3 | 15 | 0 | 0 | Bash×1 Read×1 |
| t2-B-r1 | create | ok | yes | 574,027 | 7,125 | 0.57 | 26 | 573 | 6 | 1 | Read×10 Bash×11 Skill×1 Write×2 |
| t2-B-r1 | revise | ok | yes | 323,759 | 2,134 | 0.21 | 7 | 278 | 2 | 0 | Read×4 Bash×2 |
| t2-B-r2 | create | ok | yes | 226,975 | 4,040 | 0.28 | 15 | 316 | 4 | 1 | Bash×10 Skill×1 Read×2 |
| t2-B-r2 | revise | ok | yes | 85,317 | 1,736 | 0.08 | 5 | 219 | 2 | 0 | Bash×2 Read×2 |
| t3-A-r1 | create | ok | yes | 229,934 | 11,105 | 0.46 | 14 | 252 | 0 | 0 | Read×4 Bash×5 Write×1 Edit×3 |
| t3-A-r1 | revise | ok | yes | 162,298 | 1,693 | 0.11 | 8 | 72 | 0 | 0 | Grep×1 Read×2 Edit×3 Bash×1 |
| t3-A-r2 | create | ok | yes | 205,379 | 9,088 | 0.39 | 12 | 271 | 0 | 0 | Bash×6 Write×1 Edit×1 Read×3 |
| t3-A-r2 | revise | ok | yes | 119,430 | 1,105 | 0.08 | 4 | 85 | 0 | 0 | Grep×1 Bash×1 Read×1 |
| t3-B-r1 | create | ok | yes | 365,695 | 6,635 | 0.44 | 18 | 185 | 6 | 1 | Read×5 Bash×9 Skill×1 Write×1 |
| t3-B-r1 | revise | ok | yes | 204,897 | 1,867 | 0.14 | 5 | 60 | 1 | 0 | Read×2 Bash×2 |
| t3-B-r2 | create | ok | yes | 378,475 | 6,808 | 0.47 | 20 | 155 | 6 | 1 | Read×4 Bash×11 Skill×1 Write×1 Edit×1 |
| t3-B-r2 | revise | ok | yes | 177,058 | 2,079 | 0.13 | 4 | 47 | 1 | 0 | Bash×2 Read×1 |
| t4-A-r1 | create | ok | yes | 83,610 | 2,754 | 0.15 | 12 | 34 | 0 | 0 | Read×6 Bash×5 |
| t4-A-r1 | revise | ok | yes | 35,794 | 985 | 0.04 | 3 | 13 | 0 | 0 | Bash×1 Read×1 |
| t4-A-r2 | create | ok | yes | 66,297 | 2,301 | 0.12 | 9 | 29 | 0 | 0 | Read×4 Bash×4 |
| t4-A-r2 | revise | ok | yes | 29,809 | 998 | 0.04 | 3 | 13 | 0 | 0 | Bash×1 Read×1 |
| t4-B-r1 | create | ok | yes | 68,127 | 1,740 | 0.12 | 8 | 25 | 0 | 0 | Read×3 Bash×4 |
| t4-B-r1 | revise | ok | yes | 51,612 | 1,164 | 0.07 | 4 | 17 | 0 | 0 | Bash×1 Read×2 |
| t4-B-r2 | create | ok | yes | 109,467 | 2,413 | 0.18 | 11 | 31 | 1 | 1 | Read×3 Bash×5 Skill×1 |
| t4-B-r2 | revise | ok | yes | 67,688 | 1,100 | 0.06 | 3 | 16 | 0 | 0 | Bash×1 Read×1 |
