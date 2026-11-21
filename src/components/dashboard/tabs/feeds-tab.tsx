"use client";

/**
 * @file src/components/dashboard/tabs/feeds-tab.tsx
 * @description API Data Feeds & Webhook Ingestion workspace: full CRUD, copyable
 * webhook endpoint + cURL integration snippet, API key rotation, live JSON payload
 * tester, and Remote HTTP JSON Pull Sync.
 */

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Plus,
  Send,
  Trash2,
  Webhook,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModernSelect } from "@/components/ui/select";
import type { DataFeedItem, OverviewPayload } from "../cms-types";

interface FeedsTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    headline: "Q4 Sales vs Target",
    kpis: [
      { label: "Revenue", value: "$1.42M", delta: "+14.2%" },
      { label: "Target", value: "108%", delta: "On Track" },
    ],
    chartData: [
      { label: "North", value: 42, target: 38 },
      { label: "Central", value: 58, target: 50 },
      { label: "South", value: 36, target: 35 },
    ],
  },
  null,
  2
);

export function FeedsTab({ data, onRefresh }: FeedsTabProps) {
  const [showCreate, setShowCreate] = useState(data.dataFeeds.length === 0);
  const [keySlug, setKeySlug] = useState("");
  const [name, setName] = useState("");
  const [deptId, setDeptId] = useState(data.departments[0]?.id ?? "");
  const [sourceType, setSourceType] =
    useState<DataFeedItem["sourceType"]>("push_webhook");
  const [initialJson, setInitialJson] = useState(SAMPLE_PAYLOAD);
  const [creating, setCreating] = useState(false);

  const [revealedKey, setRevealedKey] = useState<{
    feedKey: string;
    apiKey: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [payloadDrafts, setPayloadDrafts] = useState<Record<string, string>>({});
  const [pullUrls, setPullUrls] = useState<Record<string, string>>({});
  const [busyFeedId, setBusyFeedId] = useState<string | null>(null);

  const deptById = useMemo(
    () => new Map(data.departments.map((d) => [d.id, d])),
    [data.departments]
  );

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app";

  function copyText(id: string, text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`Copied ${label}`);
    setTimeout(() => setCopiedId(null), 1800);
  }

  async function handleCreateFeed(e: React.FormEvent) {
    e.preventDefault();
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(initialJson || "{}");
    } catch {
      toast.error("Initial JSON payload is not valid JSON.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: keySlug.trim().toLowerCase(),
          name: name.trim(),
          departmentId: deptId,
          sourceType,
          payload: parsedPayload,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not create data feed");
        return;
      }
      if (json.apiKey && json.feed?.key) {
        setRevealedKey({ feedKey: json.feed.key, apiKey: json.apiKey });
      }
      toast.success(`Created API data feed "${name.trim()}"`);
      setKeySlug("");
      setName("");
      setShowCreate(false);
      await onRefresh();
    } finally {
      setCreating(false);
    }
  }

  async function handlePushPayload(feed: DataFeedItem) {
    const raw =
      payloadDrafts[feed.id] ?? JSON.stringify(feed.payload ?? {}, null, 2);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error("Payload must be valid JSON");
      return;
    }
    setBusyFeedId(feed.id);
    try {
      const res = await fetch(`/api/integrations/feeds/${feed.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: parsed, fromCms: true }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Failed to push payload");
        return;
      }
      toast.success(`Ingested live snapshot into "${feed.name}" & pushed to TVs`);
      await onRefresh();
    } finally {
      setBusyFeedId(null);
    }
  }

  async function handlePullUrl(feed: DataFeedItem) {
    const pullUrl = (pullUrls[feed.id] ?? "").trim();
    if (!pullUrl) {
      toast.error("Enter an HTTP/HTTPS JSON endpoint URL to pull.");
      return;
    }
    setBusyFeedId(feed.id);
    try {
      const res = await fetch(`/api/feeds/${feed.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pullUrl }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Remote JSON pull failed");
        return;
      }
      setPayloadDrafts((prev) => ({
        ...prev,
        [feed.id]: JSON.stringify(j.feed?.payload ?? {}, null, 2),
      }));
      toast.success(`Pulled live JSON from remote API & refreshed TVs`);
      await onRefresh();
    } finally {
      setBusyFeedId(null);
    }
  }

  async function handleRotateKey(feed: DataFeedItem) {
    if (!window.confirm(`Rotate the webhook API key for "${feed.name}"? Old keys will stop working.`)) {
      return;
    }
    const res = await fetch(`/api/feeds/${feed.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotateApiKey: true }),
    });
    const j = await res.json();
    if (!res.ok) {
      toast.error(j.error || "Failed to rotate key");
      return;
    }
    if (j.apiKey) {
      setRevealedKey({ feedKey: feed.key, apiKey: j.apiKey });
      toast.success("Generated new webhook API key — copy it now!");
    }
  }

  async function handleDeleteFeed(feed: DataFeedItem) {
    if (!window.confirm(`Delete data feed "${feed.name}"?`)) return;
    const res = await fetch(`/api/feeds/${feed.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete feed");
      return;
    }
    toast.success(`Deleted "${feed.name}"`);
    await onRefresh();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">
              Live Data Feeds &amp; API Ingestion
            </h2>
            <p className="text-xs text-zinc-500">
              Ingest real-time ERP, POS, IoT, or Sheets JSON via secure webhooks or remote HTTP pull to drive live TV charts.
            </p>
          </div>
          <Badge variant="info">{data.dataFeeds.length} Feeds</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-3.5" />
          New Data Feed
        </Button>
      </div>

      {/* One-Time Revealed API Key Banner */}
      {revealedKey && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900">
          <div className="space-y-1">
            <p className="font-bold">
              API Key for <code>{revealedKey.feedKey}</code> (shown once — save securely):
            </p>
            <code className="block rounded bg-white px-2.5 py-1 font-mono text-[11px] text-zinc-900">
              {revealedKey.apiKey}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                copyText("new-key", revealedKey.apiKey, "Webhook API Key")
              }
            >
              <Copy className="size-3" />
              Copy Key
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setRevealedKey(null)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Create New Feed Form */}
      {showCreate && (
        <Card className="border-blue-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Create API Data Feed</CardTitle>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setShowCreate(false)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateFeed} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Feed Slug Key</Label>
                  <Input
                    className="h-8 font-mono text-xs"
                    placeholder="e.g. erp-sales-live"
                    value={keySlug}
                    onChange={(e) => setKeySlug(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Feed Name</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="e.g. Live ERP Revenue Feed"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <ModernSelect
                    size="sm"
                    value={deptId}
                    onValueChange={setDeptId}
                    options={data.departments.map((d) => ({
                      value: d.id,
                      label: d.name,
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Source Mode</Label>
                  <ModernSelect
                    size="sm"
                    value={sourceType}
                    onValueChange={(v) =>
                      setSourceType(v as DataFeedItem["sourceType"])
                    }
                    options={[
                      { value: "push_webhook", label: "Push Webhook API" },
                      { value: "google_sheet", label: "Remote JSON / Sheet" },
                      { value: "manual_json", label: "Manual JSON Snapshot" },
                    ]}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Initial JSON Payload</Label>
                <Textarea
                  rows={5}
                  className="font-mono text-xs"
                  value={initialJson}
                  onChange={(e) => setInitialJson(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={creating}>
                  <Webhook className="size-3.5" />
                  {creating ? "Creating..." : "Create Feed & Generate API Key"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Feeds List with Live Ingestion Tester & Pull Sync */}
      {data.dataFeeds.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-zinc-500">
            No API data feeds configured yet. Click <strong>New Data Feed</strong> to generate a webhook endpoint.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.dataFeeds.map((feed) => {
            const endpoint = `${origin}/api/integrations/feeds/${feed.key}`;
            const curlCmd = `curl -X POST "${endpoint}" -H "Content-Type: application/json" -H "x-feed-key: YOUR_API_KEY" -d '{"payload":{"headline":"Live Update"}}'`;
            const dept = deptById.get(feed.departmentId);
            const busy = busyFeedId === feed.id;

            return (
              <Card key={feed.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-sm font-semibold">
                          {feed.name}
                        </CardTitle>
                        <Badge variant="info" className="font-mono text-[10px]">
                          {feed.key}
                        </Badge>
                        <Badge variant="purple" className="text-[10px]">
                          {feed.sourceType.replace("_", " ")}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1 text-xs">
                        {dept?.name ?? "General"} • Last synced:{" "}
                        {feed.lastSyncedAt
                          ? new Date(feed.lastSyncedAt).toLocaleString()
                          : "Never"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Rotate Webhook API Key"
                        onClick={() => void handleRotateKey(feed)}
                      >
                        <KeyRound className="size-3.5 text-amber-600" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete Feed"
                        onClick={() => void handleDeleteFeed(feed)}
                      >
                        <Trash2 className="size-3.5 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Webhook Endpoint & cURL Copy Strip */}
                  <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-600">
                        Webhook Ingestion URL
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            copyText(`ep-${feed.id}`, endpoint, "Endpoint URL")
                          }
                        >
                          {copiedId === `ep-${feed.id}` ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          URL
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            copyText(`curl-${feed.id}`, curlCmd, "cURL snippet")
                          }
                        >
                          {copiedId === `curl-${feed.id}` ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          cURL
                        </Button>
                      </div>
                    </div>
                    <code className="block truncate rounded bg-white px-2 py-1 font-mono text-[10px] text-zinc-700">
                      POST {endpoint}
                    </code>
                  </div>

                  {/* Remote HTTP JSON Pull Sync */}
                  <div className="flex items-center gap-1.5">
                    <Input
                      className="h-7 flex-1 text-xs"
                      placeholder="Optional: Pull JSON from https://api.example.com/metrics.json"
                      value={pullUrls[feed.id] ?? ""}
                      onChange={(e) =>
                        setPullUrls((prev) => ({
                          ...prev,
                          [feed.id]: e.target.value,
                        }))
                      }
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handlePullUrl(feed)}
                    >
                      <Download className="size-3" />
                      Pull URL
                    </Button>
                  </div>

                  {/* Live JSON Snapshot Editor & Test Push */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-500">
                      Live JSON Payload Snapshot
                    </Label>
                    <Textarea
                      rows={5}
                      className="font-mono text-[11px]"
                      value={
                        payloadDrafts[feed.id] ??
                        JSON.stringify(feed.payload ?? {}, null, 2)
                      }
                      onChange={(e) =>
                        setPayloadDrafts((prev) => ({
                          ...prev,
                          [feed.id]: e.target.value,
                        }))
                      }
                    />
                    <Button
                      size="xs"
                      className="w-full"
                      disabled={busy}
                      onClick={() => void handlePushPayload(feed)}
                    >
                      <Send className="size-3" />
                      {busy ? "Ingesting..." : "Push Snapshot Live to Screens"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
