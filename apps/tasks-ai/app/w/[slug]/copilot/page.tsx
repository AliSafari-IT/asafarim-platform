import { requireMembership } from "../../../../lib/workspace-access";
import { getTasksAiDb } from "../../../../lib/db/client";
import { getAiSettings } from "../../../../lib/ai/settings";
import { isAtLeast } from "../../../../lib/authz";
import { aiDisabledState, intentFor } from "../../../../lib/ai/workflow";
import { CopilotPanel } from "../../../../components/ai/CopilotPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Copilot" };

/**
 * The guided intent-to-plan workflow (issue #368).
 *
 * Contextual entry points around the product link here with `?intent=…` (the
 * outcome the user picked in plain words), optionally `?task=…` (start from
 * an existing task) and `?from=…` (which surface sent them, for the funnel).
 * All three are untrusted: an unknown intent falls back to the default, and
 * a task id is resolved through the same membership-scoped query everything
 * else uses, so a guessed id reveals nothing.
 */
export default async function CopilotPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const m = await requireMembership(slug);
  const db = getTasksAiDb();

  const first = (value: string | string[] | undefined): string | null =>
    Array.isArray(value) ? value[0] ?? null : value ?? null;

  const projects = await db.project.findMany({
    where: {
      workspaceId: m.workspaceId,
      archivedAt: null,
      // The workspace Inbox container is where untriaged work waits, not a
      // destination anybody deliberately drafts a plan into.
      isInbox: false,
      ...(m.role === "guest"
        ? { members: { some: { membership: { platformUserId: m.platformUserId } } } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true, name: true },
  });

  const settings = await getAiSettings({
    db,
    workspaceId: m.workspaceId,
    workspaceSlug: slug,
    actor: { membershipId: m.membershipId, platformUserId: m.platformUserId, role: m.role },
    correlationId: "page",
  });

  if (!settings.enabled) {
    // `customfield.manage` is the admin gate updateAiSettings() itself
    // enforces — mirrored here so the link is only offered to somebody who
    // could actually act on it.
    const state = aiDisabledState(isAtLeast(m.role, "admin"));
    return (
      <section className="ta-tw">
        <h1>{state.title}</h1>
        <div className="ta-callout" role="note">
          <p>{state.description}</p>
          {state.settingsLink && (
            <p>
              <a className="ta-link" href={`/w/${slug}/settings`}>
                Open AI settings
              </a>
            </p>
          )}
        </div>
      </section>
    );
  }

  // Starting from a task (the contextual actions on a task's detail view):
  // seed the source with what the task already says, so the user edits real
  // context instead of retyping it.
  const taskId = first(query.task);
  const task = taskId
    ? await db.task.findFirst({
        where: {
          id: taskId,
          workspaceId: m.workspaceId,
          archivedAt: null,
          ...(m.role === "guest"
            ? { project: { members: { some: { membership: { platformUserId: m.platformUserId } } } } }
            : {}),
        },
        select: { id: true, title: true, description: true, projectId: true },
      })
    : null;

  // Activation funnel (issue #365): the first draft and the first applied
  // draft are the moments worth measuring, not every later one.
  const [proposalCount, appliedCount] = await Promise.all([
    db.proposal.count({ where: { workspaceId: m.workspaceId } }),
    db.proposal.count({
      where: { workspaceId: m.workspaceId, state: { in: ["applied", "partially_applied"] } },
    }),
  ]);

  // A task-seeded draft should default to the task's own project, so the
  // obvious destination is not something the user has to re-pick.
  const ordered = task
    ? [...projects].sort((a, b) =>
        a.id === task.projectId ? -1 : b.id === task.projectId ? 1 : 0,
      )
    : projects;

  return (
    <CopilotPanel
      slug={slug}
      projects={ordered}
      canCreateProject={isAtLeast(m.role, "member")}
      initialIntent={intentFor(first(query.intent)).id}
      initialSource={
        task ? [task.title, task.description ?? ""].filter(Boolean).join("\n\n") : ""
      }
      taskContext={task ? { id: task.id, title: task.title } : null}
      openedFrom={first(query.from) ?? "nav"}
      firstProposal={proposalCount === 0}
      firstApply={appliedCount === 0}
    />
  );
}
