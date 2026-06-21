import Link from "next/link";

type SubjectCardProps = {
  id: string;
  name: string;
  icon: string;
  taskCount: number;
  noteCount: number;
  onDelete: () => void;
};

export function SubjectCard({
  id,
  name,
  icon,
  taskCount,
  noteCount,
  onDelete,
}: SubjectCardProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
      <Link href={`/subjects/${id}`} className="flex-1">
        <h2 className="font-semibold">
          {icon} {name}
        </h2>

        <p className="text-sm text-gray-500">
          {taskCount} pending tasks · {noteCount} notes
        </p>
      </Link>

      <button
        className="rounded-lg border px-3 py-1 text-sm text-red-500"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}