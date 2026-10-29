<script lang="ts">
  let { size = 18, class: className = "" }: { size?: number; class?: string } =
    $props();
</script>

<span
  class={`inline-block animate-spin rounded-full border-2 border-app-border-strong border-t-sky-400 ${className}`}
  style={`width:${size}px;height:${size}px`}
  aria-hidden="true"
></span>
