import type { ReactNode } from "react";
import { ProductGridSkeleton, Skeleton, EmptyState, Alert } from "./ui";
import { Cart, Sparkles } from "./Icons";

export function Loading({ rows = 8 }: { rows?: number }) {
  return <ProductGridSkeleton count={rows} />;
}

export function PageLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3 rounded-xl" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="mb-3 h-4 w-1/4" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg">
      <EmptyState
        icon={<Sparkles className="h-6 w-6" />}
        title="Something went wrong"
        message={message}
        action={
          <div className="w-full">
            <Alert tone="warn">
              Is the API server running? Start it with{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 text-xs">npm run server</code>
            </Alert>
          </div>
        }
      />
    </div>
  );
}

export function EmptyBox({
  message,
  title,
  icon,
}: {
  message: string;
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <EmptyState
      icon={icon ?? <Cart className="h-6 w-6" />}
      title={title ?? "Nothing here yet"}
      message={message}
    />
  );
}
