# Minimum Feishu permissions for `feishu_base_direct`

Use a user-owned Feishu enterprise app dedicated to that user's template copy.

## Tenant scopes

Request only:

- `base:record:retrieve` — search/read the one scoped task, matching feedback, and existing event/receipt keys.
- `base:record:create` — create Agent event rows and acknowledgement receipt rows.

The Connector does not need record update/delete, Base/table/field creation, Drive-wide access, messaging, bot, contacts, calendar, or AI/model scopes.

## Document access

After publishing/approving the app, add it to the copied Base as a document application or collaborator with access to the four configured tables. It needs read access to Tasks/Feedback and create/read access to Events/Receipts. If Feishu only offers one document-level role, use the narrowest role that permits those operations and do not give access to unrelated Bases.

The scope grant and document membership are both required: API scopes alone do not authorize a particular Base.

## Local secret handling

Inject App ID, App Secret, Base app token, and table IDs from the user's local environment or secret manager. The App Secret and tenant access token must never be placed in URLs, command arguments, logs, templates, snapshots, artifacts, or the repository.

Rotate the App Secret and webhook token in the user's own systems. Rotation must not require a repository change.

Feishu permission names and availability can change; verify the two granular record scopes in the current [Feishu Open Platform](https://open.feishu.cn/) before granting broader access.
