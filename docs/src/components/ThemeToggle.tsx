import { MoonIcon, SunIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Flips the `.dark` class on <html> and persists the choice. Both icons render;
 * CSS `dark:` variants decide which is visible, so there's no hydration flash.
 */
export default function ThemeToggle() {
  function toggle() {
    const isDark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch (_) {}
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className="text-muted-foreground hover:text-foreground"
    >
      <SunIcon className="hidden size-4 dark:block" />
      <MoonIcon className="size-4 dark:hidden" />
    </Button>
  );
}
