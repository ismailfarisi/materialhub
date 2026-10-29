"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useSavedSearches,
  useCreateSavedSearch,
  useUpdateSavedSearch,
  useDeleteSavedSearch,
} from "@/lib/queries/account";
import { Search, Trash2, Bell, BellOff, Plus } from "lucide-react";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(44,24,16,0.2)",
  background: "rgba(255,255,255,0.6)",
  fontFamily: MAISON_SANS,
  borderRadius: 0,
};

export default function SavedSearchesPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  // savedSearches key is in account namespace
  const { data, isLoading } = useSavedSearches();
  const createSearch = useCreateSavedSearch();
  const updateSearch = useUpdateSavedSearch();
  const deleteSearch = useDeleteSavedSearch();

  const [showForm, setShowForm] = useState(false);
  const [newQuery, setNewQuery] = useState("");
  const [newName, setNewName] = useState("");

  const focusAmber = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "hsl(var(--nl-amber))";
    e.currentTarget.style.boxShadow = "0 0 0 1px hsl(var(--nl-amber))";
  };
  const blurAmber = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "rgba(44,24,16,0.2)";
    e.currentTarget.style.boxShadow = "none";
  };

  if (isLoading)
    return (
      <div
        className="py-12 text-center"
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 16,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {tCommon("loading")}
      </div>
    );

  const items = data?.items || [];

  const handleCreate = () => {
    if (!newQuery.trim()) return;
    createSearch.mutate(
      { query: newQuery, name: newName || undefined, notify_on_match: false },
      {
        onSuccess: () => {
          setNewQuery("");
          setNewName("");
          setShowForm(false);
        },
      },
    );
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <Eyebrow>SAVED SEARCHES</Eyebrow>
          <SerifTitle size={26} className="mt-1.5">
            {t("savedSearches")}
          </SerifTitle>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 uppercase shrink-0"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "hsl(var(--nl-amber))",
          }}
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          {tCommon("add")}
        </button>
      </div>

      {showForm && (
        <div
          className="mb-4 space-y-3"
          style={{
            border: "1px solid rgba(44,24,16,0.10)",
            background: "rgba(44,24,16,0.02)",
            padding: 16,
          }}
        >
          <input
            type="text"
            placeholder={t("searchQueryPlaceholder")}
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
            onFocus={focusAmber}
            onBlur={blurAmber}
            className="w-full px-3.5 py-2.5 text-sm outline-none transition-all text-nl-cacao"
            style={inputStyle}
          />
          <input
            type="text"
            placeholder={t("searchNamePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onFocus={focusAmber}
            onBlur={blurAmber}
            className="w-full px-3.5 py-2.5 text-sm outline-none transition-all text-nl-cacao"
            style={inputStyle}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createSearch.isPending}
              className="uppercase disabled:opacity-50"
              style={{
                background: "hsl(var(--nl-amber))",
                color: "hsl(var(--nl-espresso))",
                fontFamily: MAISON_SANS,
                fontSize: 11,
                letterSpacing: "0.22em",
                padding: "13px 30px",
                border: "none",
                borderRadius: 0,
              }}
            >
              {createSearch.isPending ? tCommon("loading") : tCommon("save")}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="uppercase transition-colors"
              style={{
                background: "transparent",
                border: "1px solid rgba(44,24,16,0.4)",
                color: "hsl(var(--nl-cacao))",
                fontFamily: MAISON_SANS,
                fontSize: 11,
                letterSpacing: "0.22em",
                padding: "13px 30px",
                borderRadius: 0,
              }}
            >
              {tCommon("cancel")}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div
          className="py-12 text-center"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {tCommon("noResults")}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item: any) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 px-3.5 md:px-4 py-3"
              style={{
                border: "1px solid rgba(44,24,16,0.10)",
                background: "rgba(44,24,16,0.02)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Search
                  className="h-4 w-4 text-nl-russet shrink-0"
                  strokeWidth={1.25}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 13,
                      fontWeight: 500,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    {item.name || item.query}
                  </p>
                  {item.name && (
                    <p className="text-xs text-nl-russet truncate">
                      {item.query}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    updateSearch.mutate({
                      id: item.id,
                      notify_on_match: !item.notify_on_match,
                    })
                  }
                  className="p-2 transition-colors text-nl-russet hover:text-nl-cacao"
                  title={
                    item.notify_on_match
                      ? t("disableNotifications")
                      : t("enableNotifications")
                  }
                  aria-label={
                    item.notify_on_match
                      ? t("disableNotifications")
                      : t("enableNotifications")
                  }
                >
                  {item.notify_on_match ? (
                    <Bell className="h-4 w-4 text-nl-amber" strokeWidth={1.25} />
                  ) : (
                    <BellOff
                      className="h-4 w-4 text-nl-russet"
                      strokeWidth={1.25}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSearch.mutate(item.id)}
                  className="p-2 transition-colors text-nl-russet hover:text-nl-cacao"
                  aria-label={tCommon("delete")}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.25} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
