"use client";

import { useState } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Input,
  Textarea,
  Skeleton,
} from "@materialhub/ui";
import { useSiteSettings, useUpdateSiteSetting } from "@/lib/queries/cms";
import {
  SETTING_GROUPS_WITH_PAGES,
  type SiteSettingRow,
  serializeSettingInput,
  settingEditText,
  settingGroupTabs,
  settingValueType,
} from "@/lib/site-settings";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { Lock, Save } from "lucide-react";

type Setting = SiteSettingRow;

function SettingRow({ setting }: { setting: Setting }) {
  const { mutate: updateSetting, isPending } = useUpdateSiteSetting();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(() => settingEditText(setting));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const valueType = settingValueType(setting);
  const isNumeric = valueType === "number" || valueType === "integer";

  function handleSave() {
    setError("");
    const result = serializeSettingInput(valueType, val);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    updateSetting(
      { key: setting.key, value: result.value },
      {
        onSuccess: () => {
          setEditing(false);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
        onError: (err: unknown) =>
          setError(
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              "Failed to save setting.",
          ),
      }
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-linen p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-sm font-semibold text-cacao">{setting.key}</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-pearl/100 text-taupe">{valueType}</span>
          </div>
          {setting.description && (
            <p className="text-sm text-stone-600 mb-2">{setting.description}</p>
          )}

          {!editing ? (
            <div className="mt-1">
              {valueType === "boolean" ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  setting.value === "true" ? "bg-green-50 text-green-700" : "bg-pearl/100 text-taupe"
                }`}>
                  {setting.value === "true" ? "On" : "Off"}
                </span>
              ) : valueType === "json" ? (
                <pre className="text-xs bg-pearl/50 rounded-lg p-3 overflow-x-auto max-h-40 text-cacao whitespace-pre">
                  {settingEditText(setting)}
                </pre>
              ) : (
                <span className="text-sm text-cacao break-all">{String(setting.value ?? "—")}</span>
              )}
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {valueType === "boolean" ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setVal((v) => (v === "true" ? "false" : "true"))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      val === "true" ? "bg-blue-600" : "bg-pearl/200"
                    }`}
                    role="switch"
                    aria-checked={val === "true"}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-linen shadow transition duration-200 ${val === "true" ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                  <span className="text-sm text-cacao">{val === "true" ? "Enabled" : "Disabled"}</span>
                </div>
              ) : valueType === "json" ? (
                <Textarea
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  rows={5}
                  className="font-mono text-sm"
                />
              ) : isNumeric ? (
                <Input
                  type="number"
                  step={valueType === "integer" ? 1 : "any"}
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                />
              ) : (
                <Input
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                />
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSave} disabled={isPending}>
                  <Save size={13} className="mr-1" />
                  {isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setVal(settingEditText(setting));
                    setError("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {saved && !editing && (
            <p className="text-xs text-green-600 mt-1">Saved successfully.</p>
          )}
        </div>

        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-cacao hover:bg-pearl/50 hover:border-stone-300"
            title="Edit this setting"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

function GroupTab({ settings }: { settings: Setting[] }) {
  if (!settings.length) {
    return (
      <div className="mt-8 text-center text-taupe text-sm">No settings in this group.</div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {settings.map((s) => (
        <SettingRow key={s.key} setting={s} />
      ))}
    </div>
  );
}

export default function CmsSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === "super_admin";

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Lock size={40} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-cacao mb-1">Access Restricted</h2>
        <p className="text-taupe text-sm">Site settings are only accessible to Super Admins.</p>
      </div>
    );
  }

  return <SettingsTabs />;
}

function SettingsTabs() {
  // One request for every setting; tabs are the groups that actually have keys.
  const { data, isLoading } = useSiteSettings();
  const all: Setting[] = Array.isArray(data) ? data : (data?.settings ?? data?.items ?? []);
  const groups = settingGroupTabs(all);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Site Settings</h1>
        <p className="text-taupe text-sm">Configure global platform settings. Changes take effect immediately.</p>
        <p className="text-taupe text-sm mt-1">
          Some settings have their own page:{" "}
          {Object.values(SETTING_GROUPS_WITH_PAGES).map((g, i) => (
            <span key={g.href}>
              {i > 0 && ", "}
              <Link href={g.href} className="underline underline-offset-4">
                {g.label}
              </Link>
            </span>
          ))}
          .
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="mt-8 text-center text-taupe text-sm">No site settings found.</div>
      ) : (
        <Tabs defaultValue={groups[0].key}>
          <TabsList>
            {groups.map((g) => (
              <TabsTrigger key={g.key} value={g.key}>{g.label}</TabsTrigger>
            ))}
          </TabsList>

          {groups.map((g) => (
            <TabsContent key={g.key} value={g.key}>
              <GroupTab settings={all.filter((s) => (s.group || "general") === g.key)} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
