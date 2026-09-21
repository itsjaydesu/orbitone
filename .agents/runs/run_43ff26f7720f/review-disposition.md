# Review disposition

ORCH accepts the verified repair source and the explicit follow-up boundaries below.
Independent re-review remains required for evidence integration.

- SP-1: Fixed by c5f03f0. All four current evidence targets are committed.
- SP-2: Tracked in DIG-3964. The frozen metric captures first target reach; later reversion needs separate coverage.
- ST-1: Waived. Git failures still block capture. Better diagnostic classification does not affect this measured result.
- ST-2: Waived. The extra serialized diagnostic fields contain only numeric test inputs and cannot affect the gate.
- ST-3: Waived. The receiver and closed-over probe refer to the same object in the current call path.
- ST-4: Waived. Preserve raw capture paths as provenance. Repository-relative documentation links resolve to the committed reports.
- SP-3: Waived. The displayed +0.01 is rounded. The raw computed allowance is 0.010216 and the candidate decreases CPU.
- SP-4: Accepted. The shared module directly implements R3 across TypeScript and plain Node entry points.

Follow-up: https://linear.app/digital-philosophy/issue/DIG-3964/orbitone-detect-seek-reversion-after-first-target-reach-in-performance
