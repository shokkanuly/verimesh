# Completed LIVE Run: Recording Scenes

October 11, 2026: one Monad testnet run completed with real receipts. Inputs are
SYNTHETIC; the bridge is first-party MockBridge; one signer is trusted.
Use `pnpm demo` and [SUBMISSION.md](../SUBMISSION.md) for the three-minute outline.
No extra broadcast is required or authorized within the remaining budget.

## Read-Only Product Scenes

1. Open the printed `/dashboard?mode=live` URL. Confirm LIVE, five accepted events
   and three applied actions. RECORDED is a separate fixture view.
2. Benign: [accepted verdict](https://testnet.monadscan.com/tx/0x930107da363ab95a0410301a765afb1e08b5c864b2ca26f489c5c29dc71cce49),
   [successful release](https://testnet.monadscan.com/tx/0xc4b0cbdef7146eb1d3f3622bfe5f0adadf29afa83b8852f940266c106e77b457).
3. Throttle: [action](https://testnet.monadscan.com/tx/0x688ef2460aaed01c44c9610101e1ec7b0217cea9fa30a26ff41bed2dbe57272a),
   [cap rejection](https://testnet.monadscan.com/tx/0x79bbcc455d09d22d32ed7ccebb35e96d8b99289ffaca87af8d548f36d9b773fc).
4. Delay: [action](https://testnet.monadscan.com/tx/0x5f5f86823fa838c4aecc77ba826f91d5dda14da3dc66714902979a5486b14437),
   [blocked release](https://testnet.monadscan.com/tx/0xc59339a8617000e448c2df7a35b164922b33e25d013b9ce4a6e7bb74b3b86eaa).
5. Freeze: [action](https://testnet.monadscan.com/tx/0x399115d72c573d4b77428b7064f8305420409f27c200f1ed7b90ab3e51d07710),
   [blocked release](https://testnet.monadscan.com/tx/0x5cf7e1f152ce82ed74b8eac5ca1aa2bebf34127049fb60b4f02cf5538a447745).
6. Select freeze evidence, Verify, change `proofMismatch`, Verify, Restore.
   Expected results: PASS / OFFLINE, MISMATCH, PASS / OFFLINE.
7. Show [tamper rejection](https://testnet.monadscan.com/tx/0xf5cb7fc5ca0192467e1c504a8bb74c4cb01ddd4279f10477b0b71e7b83ee0cb7),
   [duplicate rejection](https://testnet.monadscan.com/tx/0xd98e6f3c14fd54b5cca748ad84ae0f21f1177da601e0df291a6ae8f10e7a5717),
   [owner reset](https://testnet.monadscan.com/tx/0x5bd895d4339a8aec593c85d031d0acccf80b6978fb8f8a5953c20c647d2f0428),
   [release after reset](https://testnet.monadscan.com/tx/0x4c7393e442dec845d96abbdcebddca3879bddc0423e8bbc9f6a75366737c28ad).
8. Run `pnpm verify-bundle evidence/live/bundle-freeze.json` for portable offline
   consistency checks. Current key ownership/acceptance comes from separate RPC
   checks, not that CLI command.

[Full run with labels, receipt status, block hashes and fees](../evidence/live/replay.json).
Current guardian state is NORMAL after reset; past actions remain visible.
Do not imply that the old verdict TTL is still live or that demo fees match
scoped EVM operation gas. `pnpm run demo:preflight` is read-only and conservatively
rejects a still-active prior outflow window until it expires naturally.
