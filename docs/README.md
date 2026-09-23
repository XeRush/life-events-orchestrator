# LIFELOOP documentation

> **One event. One call. Every next step.**

| Doc | Contents |
|---|---|
| [architecture.md](architecture.md) | Mermaid architecture: frontend, FastAPI, PostgreSQL, event bus, workflow engine, ElevenLabs, entities, callbacks, timeline, audit |
| [system-design.md](system-design.md) | Concepts, design decisions, failure model, scaling path |
| [api.md](api.md) | Every important endpoint with auth, request, response, errors, examples |
| [database.md](database.md) | Schema, ER diagram, indexes, migrations, seed |
| [workflow-engine.md](workflow-engine.md) | Graph, state machine, dependency resolution, replanning, idempotency |
| [event-model.md](event-model.md) | Event bus, catalogue, handlers, audit fields, notification policy |
| [elevenlabs.md](elevenlabs.md) | Agent, tools, auth, webhooks, conversation + callback flow, setup |
| [voice-agent.md](voice-agent.md) | Behaviour, tools, safety rules |
| [government-integrations.md](government-integrations.md) | Adapter contract, mock authorities, simulation |
| [security.md](security.md) | Authentication, RBAC, logging, guardrails, production checklist |
| [deployment.md](deployment.md) | Docker Compose, configuration, scaling notes |
| [development.md](development.md) | Local workflow, layout, tests, extending |
| [demo-script.md](demo-script.md) | 3-5 minute demo, scene by scene |
| [judging.md](judging.md) | Problem, solution, innovation, AI vs government roles |
| [decisions.md](decisions.md) | Decision log |
| [troubleshooting.md](troubleshooting.md) | Common problems |

Prototype notice: mock government entities and a demonstration workflow; government-authorized integrations would be required for production.
