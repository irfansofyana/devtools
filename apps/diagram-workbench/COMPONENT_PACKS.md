# Diagram Workbench component packs

Diagram Workbench includes a first-party default library and three optional community packs. All component content is local; the application makes no runtime request to third-party asset hosts.

## Built-in Irfan Core library

The built-in library is original editable artwork generated from repository-local Excalidraw skeleton definitions. It is available immediately in Excalidraw’s Library with no install action:

- 14 AWS Core cards, including EC2, Lambda, EKS, VPC, IAM, networking, storage, and data services.
- 9 Kubernetes cards for clusters, workloads, networking, and configuration.
- 9 AI / LLM cards for gateways, models, agents, RAG, vector storage, guardrails, and evaluation.
- 4 reusable patterns: Private EKS Platform, Multi-AZ VPC, RAG Application, and LiteLLM Gateway.

The cards use an original visual system and service-name labels; they do not copy official AWS or Kubernetes logo artwork. Stable library-item IDs and a versioned IndexedDB marker make seeding non-destructive: existing items are retained, user-deleted defaults are not recreated on every launch, and future versions add only newly introduced IDs. Startup seeding, normal library edits, and optional-pack installation use coordinated IndexedDB transactions so stale tabs cannot overwrite newly seeded items. Workspace backups preserve the marker.

## Optional-pack provenance baseline

- Community repository: <https://github.com/excalidraw/excalidraw-libraries>
- Pinned revision: `92e1979e8157da0ad9c2bd912c01ea9381d1733f`
- Repository license: MIT; retained at `licenses/excalidraw-libraries-MIT.txt`
- Runtime community fetches: none

AWS and Kubernetes names are used only as descriptive labels for architecture concepts. They and other product names remain trademarks of their respective owners; this project is not affiliated with or endorsed by Amazon Web Services, the Cloud Native Computing Foundation, or other named vendors. The repository's MIT license covers the original code and artwork, not third-party names or trademarks.

Repository inclusion is not treated as trademark or third-party-asset clearance. Optional community content therefore remains generic and reviewed, while Irfan Core uses original artwork with descriptive service labels rather than copied vendor icons.

## Optional community packs

| Pack | Source at pinned revision | Author / attribution | SHA-256 |
| --- | --- | --- | --- |
| Software architecture | `libraries/youritjang/software-architecture.excalidrawlib` | Youri Tjang | `5dead109b7569066a5fd3c2bcfe5f045c156f27a391eed71e6dd640b4317ce65` |
| System design | `libraries/rohanp/system-design.excalidrawlib` | Rohan Pithadiya | `4042532130ed87478388d28d4177177423c52ef7953c570822d60695a0b74bf7` |
| C4 architecture | `libraries/dmitry-burnyshev/c4-architecture.excalidrawlib` | Dmitry Burnyshev; based on the C4 model by Simon Brown | `54f7841eb8b24dcfab0230761f4d5099c29eacacb48b83f8856a2d70aaf15679` |

The C4 model attribution points to <https://c4model.com/>. The C4 website identifies its content as CC BY 4.0 and the model as notation- and tooling-independent.

## Deferred branded packs

AWS, Google Cloud, Azure, and Kubernetes community conversions are **not bundled in v1**. The reviewed repository metadata did not establish a clear standalone redistribution chain for those branded assets. Pinning a file proves reproducibility, not redistribution permission or freshness.

The workbench links users to current official sources instead:

- AWS Architecture Icons: <https://aws.amazon.com/architecture/icons/>
- Google Cloud icons: <https://cloud.google.com/icons>
- Kubernetes/Linux Foundation trademark guidance: <https://www.linuxfoundation.org/legal/trademark-usage>
- Azure architecture icons: <https://learn.microsoft.com/en-us/azure/architecture/icons/>

A branded pack may be added later only when its source version, redistribution permission, attribution, trademark treatment, checksum, and refresh process are documented.
