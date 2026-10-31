# Security

Blockhound controls a wallet when live trading is on. Please report vulnerabilities privately.

## Reporting

Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). Please do not open a
public issue for a security problem. Include steps to reproduce and the impact you see.

## In scope

- Ways to send a transaction that bypasses the server limits, the preview checks or the safety filter.
- Ways for untrusted content (websites, metadata, search results, LLM output) to trigger actions or commands.
- Exposure of keys, the API token or wallet data.
- Ways to reach the local server from outside `127.0.0.1`.

## Out of scope

- Losses from tokens or NFTs that turn out to be worthless or scams after passing the filter. The filter reduces risk; it cannot
  remove it.
- Issues in third-party services (Binance, OKX, OpenRouter, Brave, RPC providers).
