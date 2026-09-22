Run the PowerShell installer against the real loop_work repo, then inspect git diff before committing.

This repairs:
- broken UTF-8 currency/symbol text in the investment live view;
- the blank one-point portfolio chart;
- the blank one-point selected holding chart.

It does not invent historical performance; a one-point series is shown as a flat baseline until another evidenced point arrives.
