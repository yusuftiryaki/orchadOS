import { exitDemoAction } from "@/app/(site)/demo/actions";

// A button that ends the demo session and goes to `next` (exitDemoAction
// accepts only a few pages).
export function DemoExitButton({
  next,
  label,
  className,
  testId,
}: {
  next: string;
  label: string;
  className?: string;
  testId?: string;
}) {
  return (
    <form action={exitDemoAction}>
      <input type="hidden" name="next" value={next} />
      <button className={className ?? "button button-secondary"} type="submit" data-testid={testId}>
        {label}
      </button>
    </form>
  );
}
