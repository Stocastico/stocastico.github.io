/* The published contact address — the one line to edit.
 
   `hello@stefanomasneri.com` is a forwarding alias on the domain, not a
   mailbox. That is the entire anti-spam strategy, and it is a better one than
   the base64 obfuscation it replaced: if this address ever drowns in spam it
   is deleted at the registrar and swapped here, and the personal address was
   never on a public page to begin with. The old scheme protected a live.com
   address by encoding it in attributes named `data-email-user` /
   `data-email-domain` — one regex and one atob away from harvested, and a
   headless scraper simply ran the click handler.

   Because the defence is replaceability, this constant has to stay the only
   place the address is written. Everything else derives from it:

     * index.html's contact card — generated into the
       `<!-- generated:contact-email -->` block by scripts/generate-cards.mjs,
       so the static HTML a crawler reads cannot disagree with this file
     * js/ui.js — the ⌘K "Copy email address" action imports it directly
     * js/main.js — the copy chip reads the address off the generated markup

   js/, not data/: js/ui.js imports this statically on all 21 pages, and the
   rule that keeps data/*.js out of the eager bundle exists for modules that
   are kilobytes. This one is a string. */
export const CONTACT_EMAIL = 'hello@stefanomasneri.com';
