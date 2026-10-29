<script lang="ts">
  import Icon from "./Icon.svelte";
  import Spinner from "./Spinner.svelte";
  import { PROVIDERS } from "@/lib/settings";
  import { errorMessage } from "@/lib/messaging";
  import type {
    AppSettings,
    ProviderId,
    TestConnectionResult,
  } from "@/lib/types";

  let {
    settings,
    onSave,
    onTest,
  }: {
    settings: AppSettings;
    onSave: (settings: AppSettings) => Promise<AppSettings>;
    onTest: (options: {
      provider: ProviderId;
      apiKey: string;
      model: string;
    }) => Promise<TestConnectionResult>;
  } = $props();

  type Feedback = { kind: "success" | "error"; text: string };

  function cloneSettings(value: AppSettings): AppSettings {
    return {
      version: 1,
      activeProvider: value.activeProvider,
      providers: {
        openrouter: { ...value.providers.openrouter },
        deepseek: { ...value.providers.deepseek },
      },
      defaultMethod: value.defaultMethod,
    };
  }

  // Keep an editable copy; later prop updates come from the save response.
  // svelte-ignore state_referenced_locally
  let draft = $state<AppSettings>(cloneSettings(settings));
  let saving = $state(false);
  let testing = $state(false);
  let saveFeedback = $state<Feedback | null>(null);
  let testFeedback = $state<Feedback | null>(null);

  const activeProviderDef = $derived(PROVIDERS[draft.activeProvider]);

  function keyStatus(provider: ProviderId): string {
    const savedKey = settings.providers[provider].apiKey.trim();
    const draftKey = draft.providers[provider].apiKey.trim();
    if (draftKey && draftKey !== savedKey) return "Unsaved key";
    return draftKey ? "Key saved" : "No key";
  }

  function selectProvider(provider: ProviderId): void {
    if (draft.activeProvider === provider) return;
    draft.activeProvider = provider;
    testFeedback = null;
    saveFeedback = null;
  }

  async function handleTest(): Promise<void> {
    const credentials = draft.providers[draft.activeProvider];
    if (!credentials.apiKey.trim()) {
      testFeedback = { kind: "error", text: "Enter an API key first." };
      return;
    }
    if (!credentials.model.trim()) {
      testFeedback = { kind: "error", text: "Enter a model ID first." };
      return;
    }

    testing = true;
    testFeedback = null;
    try {
      const result = await onTest({
        provider: draft.activeProvider,
        apiKey: credentials.apiKey,
        model: credentials.model,
      });
      testFeedback = {
        kind: "success",
        text: `Connected in ${result.latencyMs} ms · ${result.reply}`,
      };
    } catch (error) {
      testFeedback = { kind: "error", text: errorMessage(error) };
    } finally {
      testing = false;
    }
  }

  async function handleSave(): Promise<void> {
    const credentials = draft.providers[draft.activeProvider];
    if (!credentials.model.trim()) {
      saveFeedback = { kind: "error", text: "Enter a model ID before saving." };
      return;
    }

    saving = true;
    saveFeedback = null;
    try {
      const saved = await onSave($state.snapshot(draft) as AppSettings);
      draft = cloneSettings(saved);
      saveFeedback = { kind: "success", text: "Settings saved locally." };
    } catch (error) {
      saveFeedback = { kind: "error", text: errorMessage(error) };
    } finally {
      saving = false;
    }
  }
</script>

{#snippet providerFields(id: ProviderId)}
  <div class="mt-3">
    <label
      for={`api-key-${id}`}
      class="mb-1.5 block text-[12px] font-medium tracking-[0.1em] text-app-muted uppercase"
    >
      API key
    </label>
    <div class="relative">
      <input
        id={`api-key-${id}`}
        type="password"
        bind:value={draft.providers[id].apiKey}
        placeholder={PROVIDERS[id].keyPlaceholder}
        autocomplete="new-password"
        autocapitalize="off"
        spellcheck="false"
        class="w-full rounded-lg border border-app-border-strong bg-app-input py-2 pr-3 pl-3 font-mono text-[13px] text-app-text transition outline-none placeholder:text-app-subtle focus:border-sky-400/50 focus:ring-2 focus:ring-sky-500/10"
      />
    </div>
  </div>

  <div class="mt-3">
    <label
      for={`model-${id}`}
      class="mb-1.5 block text-[12px] font-medium tracking-[0.1em] text-app-muted uppercase"
    >
      Model ID
    </label>
    <input
      id={`model-${id}`}
      type="text"
      bind:value={draft.providers[id].model}
      placeholder={PROVIDERS[id].defaultModel}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      class="w-full rounded-lg border border-app-border-strong bg-app-input px-3 py-2 font-mono text-[13px] text-app-text transition outline-none placeholder:text-app-subtle focus:border-sky-400/50 focus:ring-2 focus:ring-sky-500/10"
    />
    <p class="mt-1.5 text-[11px] leading-relaxed text-app-subtle">
      {PROVIDERS[id].modelHint}
    </p>
  </div>
{/snippet}

<section class="flex min-h-0 flex-1 flex-col">
  <div class="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-[17px] font-semibold tracking-tight text-app-text">
          AI provider
        </h2>
        <p class="mt-0.5 text-[13px] text-app-muted">
          Bring your own key. Nothing is sent until you click Organize.
        </p>
      </div>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      {#each Object.values(PROVIDERS) as provider (provider.id)}
        {@const selected = draft.activeProvider === provider.id}
        <button
          type="button"
          onclick={() => selectProvider(provider.id)}
          class={`rounded-xl border p-2.5 text-left transition ${
            selected
              ? "border-sky-400/40 bg-blue-500/[0.09]"
              : "border-app-border bg-app-surface hover:border-app-border-strong hover:bg-app-hover"
          }`}
          aria-pressed={selected}
        >
          <span class="flex items-center gap-1.5">
            <span
              class={`h-1.5 w-1.5 rounded-full ${
                selected ? "bg-blue-400" : "bg-app-subtle"
              }`}
            ></span>
            <span
              class={`text-[14px] font-medium ${
                selected ? "text-sky-100" : "text-app-text-secondary"
              }`}
            >
              {provider.label}
            </span>
          </span>
          <span class="mt-1 block text-[11px] text-app-muted">
            {keyStatus(provider.id)}
          </span>
        </button>
      {/each}
    </div>

    <div class="mt-3 rounded-xl border border-app-border bg-app-surface p-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[13px] font-medium text-app-text-secondary">
          {activeProviderDef.label} credentials
        </h3>
        <a
          href={activeProviderDef.modelsUrl}
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-1 text-[11px] text-sky-300/80 transition hover:text-sky-200"
        >
          Browse models
          <Icon name="external" size={9} />
        </a>
      </div>

      {@render providerFields(draft.activeProvider)}

      <div class="mt-3 flex items-center gap-2 border-t border-app-border pt-3">
        <button
          type="button"
          onclick={handleTest}
          disabled={testing || saving}
          class="inline-flex items-center gap-1.5 rounded-lg border border-app-border-strong bg-app-hover px-2.5 py-1.5 text-[12px] font-medium text-app-text-secondary transition hover:bg-app-hover disabled:opacity-50"
        >
          {#if testing}
            <Spinner size={11} />
            Testing…
          {:else}
            <Icon name="bolt" size={11} />
            Test connection
          {/if}
        </button>
        <span class="text-[11px] text-app-subtle"
          >Makes one tiny API request</span
        >
      </div>

      {#if testFeedback}
        <p
          class={`mt-2 rounded-lg px-2.5 py-2 text-[12px] leading-relaxed ${
            testFeedback.kind === "success"
              ? "bg-emerald-500/[0.08] text-emerald-300/90"
              : "bg-red-500/[0.08] text-red-300/90"
          }`}
        >
          {testFeedback.text}
        </p>
      {/if}
    </div>

    <div
      class="mt-3 flex items-start gap-2 rounded-xl border border-emerald-400/10 bg-emerald-500/[0.035] p-3"
    >
      <Icon
        name="shield"
        size={13}
        class="mt-0.5 shrink-0 text-emerald-400/60"
      />
      <p class="text-[11px] leading-relaxed text-app-muted">
        API keys are stored in this browser profile with
        <span class="text-app-muted">extension-local storage</span> — never
        synced, never sent to any server except {activeProviderDef.label} when you
        run an organization. Tab titles and hostnames are the only tab data included
        in the request. No URLs, page content, cookies, or history.
      </p>
    </div>
  </div>

  <div class="border-t border-app-border bg-app-bg px-4 pt-3 pb-4">
    {#if saveFeedback}
      <p
        class={`mb-2 text-[12px] ${
          saveFeedback.kind === "success"
            ? "text-emerald-400/90"
            : "text-red-400/90"
        }`}
      >
        {saveFeedback.text}
      </p>
    {/if}
    <button
      type="button"
      onclick={handleSave}
      disabled={saving}
      class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-sky-400 to-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:from-sky-300 hover:to-blue-500 disabled:opacity-60"
    >
      {#if saving}
        <Spinner size={14} />
        Saving…
      {:else}
        <Icon name="check" size={14} />
        Save settings
      {/if}
    </button>
  </div>
</section>
