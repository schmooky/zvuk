import { MenuIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
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
          className="text-muted-foreground md:hidden"
        >
          <MenuIcon className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle className="font-mono">Navigation</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-0.5 px-3 pb-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm transition-colors',
                isActive(link.href)
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
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
