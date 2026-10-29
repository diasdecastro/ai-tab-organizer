<script lang="ts">
  import Icon from "./Icon.svelte";
  import Spinner from "./Spinner.svelte";

  let {
    open,
    title,
    description,
    details,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone = "default",
    busy = false,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    description: string;
    details?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();
</script>

<svelte:window
  onkeydown={(event) => {
    if (open && !busy && event.key === "Escape") onCancel();
  }}
/>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    role="presentation"
  >
    <div
      class="w-full max-w-sm animate-rise rounded-2xl border border-app-border-strong bg-app-elevated p-4 shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div class="flex items-start gap-3">
        <div
          class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            tone === "danger"
              ? "bg-red-500/10 text-red-300"
              : "bg-blue-500/10 text-sky-300"
          }`}
        >
          <Icon name={tone === "danger" ? "alert" : "shield"} size={17} />
        </div>
        <div class="min-w-0 flex-1">
          <h3
            id="confirm-title"
            class="text-[15px] font-semibold text-app-text"
          >
            {title}
          </h3>
          <p class="mt-1 text-[13px] leading-relaxed text-app-muted">
            {description}
          </p>
          {#if details}
            <p
              class="mt-2 rounded-lg bg-app-input px-2.5 py-2 text-[12px] leading-relaxed text-app-muted"
            >
              {details}
            </p>
          {/if}
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onclick={onCancel}
          disabled={busy}
          class="rounded-lg border border-app-border-strong bg-app-surface px-3 py-2 text-[13px] font-medium text-app-text-secondary transition hover:bg-app-hover disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onclick={onConfirm}
          disabled={busy}
          class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white transition disabled:opacity-50 ${
            tone === "danger"
              ? "bg-red-600 hover:bg-red-500"
              : "bg-blue-600 hover:bg-blue-500"
          }`}
        >
          {#if busy}
            <Spinner size={12} />
          {:else}
            <Icon name={tone === "danger" ? "trash" : "check"} size={12} />
          {/if}
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
