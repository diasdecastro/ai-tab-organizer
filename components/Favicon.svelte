<script lang="ts">
  let {
    url,
    hostname,
    size = 16,
  }: {
    url?: string;
    hostname: string;
    size?: number;
  } = $props();

  let failed = $state(false);

  $effect(() => {
    void url;
    failed = false;
  });

  const initial = $derived(
    hostname
      .replace(/^www\./, "")
      .charAt(0)
      .toUpperCase() || "•",
  );
</script>

{#if url && !failed}
  <img
    src={url}
    alt=""
    width={size}
    height={size}
    class="shrink-0 rounded-[3px] object-contain"
    loading="lazy"
    referrerpolicy="no-referrer"
    onerror={() => (failed = true)}
  />
{:else}
  <span
    class="flex shrink-0 items-center justify-center rounded-[3px] bg-app-hover text-[10px] font-semibold text-app-muted"
    style={`width:${size}px;height:${size}px`}
    aria-hidden="true"
  >
    {initial}
  </span>
{/if}
