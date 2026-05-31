const PERMISSIONS = [
  {
    name: "activeTab",
    scope: "Required",
    reason: "Accesses only the tab the user is actively exporting from."
  },
  {
    name: "scripting",
    scope: "Required",
    reason: "Injects the local content script after the user opens the extension."
  },
  {
    name: "storage",
    scope: "Required",
    reason: "Stores local preferences such as redaction settings."
  },
  {
    name: "downloads",
    scope: "Optional",
    reason: "Saves exports through the browser downloads API when enabled."
  },
  {
    name: "tabs",
    scope: "Optional",
    reason: "Supports tab metadata and future explicit user-selected tab flows."
  },
  {
    name: "host permissions",
    scope: "Optional",
    reason: "Limits AI chat access to supported hosts selected by the user."
  }
] as const;

export function PermissionExplainer() {
  return (
    <section className="panel" aria-labelledby="permissions-title">
      <h2 id="permissions-title">Permissions</h2>
      <dl className="permission-list">
        {PERMISSIONS.map((permission) => (
          <div key={permission.name}>
            <dt>
              <span>{permission.name}</span>
              <strong>{permission.scope}</strong>
            </dt>
            <dd>{permission.reason}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
