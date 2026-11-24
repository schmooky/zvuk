import { MenuIcon, SearchIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface NavLink {
  href: string;
  label: string;
}

/**
 * Mobile-only hamburger that opens a Sheet with the full top nav + utility
 * links. The desktop nav stays in Nav.astro; this only renders below `md`.
 */
export default function MobileNav({
  links,
  pathname,
}: {
  links: NavLink[];
  pathname: string;
}) {
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          className="text-muted-foreground lg:hidden"
        >
          <MenuIcon className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle className="font-mono">Navigation</SheetTitle>
        </SheetHeader>
        <div className="px-3 pb-2">
          <SheetClose asChild>
            <button
              type="button"
              onClick={() => {
                // Search.astro listens for this; wait a frame so the sheet
                // has released focus before the dialog takes it.
                requestAnimationFrame(() => window.dispatchEvent(new Event('zvuk:search')));
              }}
              className="flex h-10 w-full items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <SearchIcon className="size-4" />
              Search the docs
            </button>
          </SheetClose>
        </div>
        <nav aria-label="Site" className="flex flex-col gap-0.5 px-3 pb-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cn(
                'rounded-sm border-l-2 px-3 py-2 text-sm transition-colors',
                isActive(link.href)
                  ? 'border-primary bg-secondary/60 text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
