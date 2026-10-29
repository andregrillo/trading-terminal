# Slow Stochastic

Converted from the user's supplied Pine script and installed under
**Indicators → Custom → Slow Stochastic** as `custom/slow-stochastic.js`.

- Stochastic Length is the high/low lookback, default 14 (the original `smoothK`
  variable). It does not change the fixed three-bar smoothing of the K line.
- K is a three-bar SMA of `100 × (close − lowest low) / (highest high − lowest low)`.
- D is an SMA of K, with its own smoothing length, default 3.
- Settings include separate **%K line thickness** and **%D line thickness**
  dropdowns, from 1 to 4. Defaults remain 2 for K and 1 for D. Apply saves the
  choices for that indicator instance; the oscillator calculations and fills
  stay the same.
- The original 80/20 guide lines and very faint purple background remain.
- Green gradients highlight K above 80; red gradients highlight K below 20.
  Their masks run between K and 50, matching the personal RSI's approach.
  The gradients become opaque at 100 and zero, respectively.
- The original black K line is black in the light theme and light grey in the
  dark theme for readability. D is red. Settings allow explicit colour choices;
  leaving K at the theme default keeps automatic theme adaptation.
- Values use two decimal places. Both `k` and `d` can be used in alerts and
  strategy conditions, including crossover rules. No alerts are created
  automatically.

The calculation uses no future candles and supports bar replay. Pine's SMA
behaviour of ignoring missing raw samples is retained; a zero high/low range
does not generate an infinite oscillator value. At the start of available
history, the range uses the highs and lows available so far.
