<script>
  // The inline icons of the rows (app.js ICONS), as markup instead of HTML strings.
  let { name } = $props();
</script>

{#if name === "cal"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 8v10h12V10H6zm2 2h3v3H8v-3z" /></svg
  >
{:else if name === "gcal"}
  <!-- Google Calendar: the same frame as the .ics calendar, but with its «31» – a glyph that reads as
       Google's calendar next to the plain one (the old «E» looked like a second .ics on a phone). -->
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 8v12h12V8H6z" /><text
      x="12"
      y="17.6"
      text-anchor="middle"
      font-family="system-ui, sans-serif"
      font-size="8.5"
      font-weight="800"
      fill="currentColor">31</text
    ></svg
  >
{:else if name === "wa"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path
      fill="currentColor"
      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-3 4.5c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 2-1.4.2-.7.2-1.2.1-1.4l-.5-.3-1.8-.9c-.3-.1-.5-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a6.5 6.5 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.4.1-.2 0-.4 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4H9z"
    /></svg
  >
{:else if name === "link"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path
      fill="currentColor"
      d="M10.6 13.4a1 1 0 0 1 0 1.4 4 4 0 0 1-5.7-5.7l3-3a4 4 0 0 1 5.6 0 1 1 0 1 1-1.4 1.4 2 2 0 0 0-2.8 0l-3 3a2 2 0 0 0 2.9 2.9 1 1 0 0 1 1.4 0zm2.8-2.8a1 1 0 0 1 0-1.4 4 4 0 0 1 5.7 5.7l-3 3a4 4 0 0 1-5.6 0 1 1 0 1 1 1.4-1.4 2 2 0 0 0 2.8 0l3-3a2 2 0 0 0-2.9-2.9 1 1 0 0 1-1.4 0z"
    /></svg
  >
{:else if name === "star"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21l1.3-6.8-5-4.7 6.8-.8z" /></svg
  >
{:else if name === "share"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path
      fill="currentColor"
      d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4zM5 10h4v2H7v9h10v-9h-2v-2h4v13H5z"
    /></svg
  >
{:else if name === "event"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path
      fill="currentColor"
      d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H5v12h12v-6h2v8H3V5h2z"
    /></svg
  >
{:else if name === "ticket"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path
      fill="currentColor"
      d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7zm2 0v2.2A4 4 0 0 1 5 14.8V17h14v-2.2a4 4 0 0 1 0-5.6V7H5zm5 2h2v6h-2V9zm4 0h2v6h-2V9z"
    /></svg
  >
{:else if name === "train"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path
      fill="currentColor"
      d="M12 2c-4 0-8 .5-8 4v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5V21h2l2-2h4l2 2h2v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-4-4-8-4zm-5.5 4c.2-1 2.6-2 5.5-2s5.3 1 5.5 2H6.5zM6 8h12v4H6V8zm1.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
    /></svg
  >
{:else if name === "rss"}
  <svg viewBox="0 0 24 24" aria-hidden="true"
    ><path
      fill="currentColor"
      d="M6.2 15.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM4 9.5a10.5 10.5 0 0 1 10.5 10.5h-3A7.5 7.5 0 0 0 4 12.5v-3zM4 3.5A16.5 16.5 0 0 1 20.5 20h-3A13.5 13.5 0 0 0 4 6.5v-3z"
    /></svg
  >
{/if}
