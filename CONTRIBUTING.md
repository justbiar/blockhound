# Contributing to Blockhound

Thanks for helping. Blockhound moves real money when live trading is on, so changes are held to a careful standard.

## Ground rules

- **Safety first.** Never weaken a guard: server-side limits, the Binance preview checks, the safety filter, the `127.0.0.1`
  binding or the API token. A change that touches them needs tests that show the guard still holds.
- **No private keys, ever.** Wallet access stays behind the `baw` CLI.
- **Untrusted input stays data.** Text from websites, contract metadata, search results and LLM output must never be treated
  as instructions or flow into a shell command.
- **No secrets in the repo.** Keys and wallet data live in `.env` and `data/`, both ignored by git. Use made-up addresses in tests.

## Workflow

1. Open an issue first for anything larger than a small fix.
2. Keep pull requests focused. Match the surrounding code: the code and UI are in Turkish, and new code should follow the same
   naming. Comments and docs in English are fine.
3. Add or update tests and run them:

```bash
npm test
```

4. Describe what you changed and how you checked it, including anything you could not test.

## Code style

Plain Node.js ES modules, no build step, vanilla HTML, CSS and JS in `public/`. Keep dependencies minimal.
