import { randomUUID } from "node:crypto";

import { api, APIError } from "encore.dev/api";

import { db } from "./db";
import {
  applyCorsHeaders,
  assertNonEmpty,
  ensureReportWritableForRequest,
  handleCorsPreflight,
  listReportsFromDb,
  readJsonBody,
  requireSession,
  sendError,
  sendJson,
} from "./helpers";
import { removeReportImage, uploadReportImage } from "./storage";
import type { ReportPriority, ReportStatus } from "./types";

interface CreateReportRequest {
  image: string;
  annotatedImage?: string | null;
  title: string;
  description?: string;
  gameTitle?: string | null;
  gameUrl?: string | null;
}

interface UpdateReportRequest {
  title?: string;
  description?: string;
  status?: ReportStatus;
  priority?: ReportPriority;
  adminNotes?: string;
  annotatedImage?: string | null;
}

function extractReportId(pathname: string | undefined): string {
  const reportId = pathname?.split("/").filter(Boolean)[1];
  if (!reportId) {
    throw APIError.invalidArgument("Report id is required.");
  }
  return reportId;
}

export const listReports = api.raw(
  { expose: true, method: "GET", path: "/reports" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        await requireSession(req);
        sendJson(resp, 200, { reports: await listReportsFromDb() });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const createReport = api.raw(
  { expose: true, method: "POST", path: "/reports", bodyLimit: 30 * 1024 * 1024 },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const auth = await requireSession(req);
        const body = await readJsonBody<CreateReportRequest>(req);
        const id = randomUUID();
        const title = assertNonEmpty(body.title, "Report title");
        const image = assertNonEmpty(body.image, "Screenshot");
        const description = body.description?.trim() ?? "";
        const annotatedImage = body.annotatedImage?.trim() || null;
        const gameTitle = body.gameTitle?.trim() || null;
        const gameUrl = body.gameUrl?.trim() || null;
        const imageObjectKey = await uploadReportImage(image, `reports/${id}/raw`);
        const annotatedObjectKey = annotatedImage ? await uploadReportImage(annotatedImage, `reports/${id}/annotated`) : null;

        await db.exec`
          INSERT INTO reports (id, author_id, title, description, image, annotated_image, status, game_title, game_url)
          VALUES (${id}, ${auth.userID}, ${title}, ${description}, ${imageObjectKey}, ${annotatedObjectKey}, 'open', ${gameTitle}, ${gameUrl})
        `;

        const reports = await listReportsFromDb();
        const report = reports.find((entry) => entry.id === id);
        if (!report) {
          throw APIError.internal("Report was created but could not be reloaded.");
        }

        sendJson(resp, 200, { report });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const updateReport = api.raw(
  { expose: true, method: "PATCH", path: "/reports/:reportId", bodyLimit: 30 * 1024 * 1024 },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const reportId = extractReportId(req.url);
        const auth = await ensureReportWritableForRequest(req, reportId);
        const body = await readJsonBody<UpdateReportRequest>(req);
        const existing = await db.queryRow<{ annotated_image: string | null }>`
          SELECT annotated_image
          FROM reports
          WHERE id = ${reportId}
        `;
        const isAdmin = auth.role === "admin";

        if (body.title !== undefined) {
          await db.exec`
            UPDATE reports
            SET title = ${assertNonEmpty(body.title, "Report title")}, updated_at = NOW()
            WHERE id = ${reportId}
          `;
        }

        if (body.description !== undefined) {
          await db.exec`
            UPDATE reports
            SET description = ${body.description.trim()}, updated_at = NOW()
            WHERE id = ${reportId}
          `;
        }

        if (body.status !== undefined) {
          if (!isAdmin) {
            throw APIError.permissionDenied("Only admins can change report status.");
          }
          await db.exec`
            UPDATE reports
            SET status = ${body.status}, updated_at = NOW()
            WHERE id = ${reportId}
          `;
        }

        if (body.priority !== undefined) {
          if (!isAdmin) {
            throw APIError.permissionDenied("Only admins can change report priority.");
          }
          await db.exec`
            UPDATE reports
            SET priority = ${body.priority}, updated_at = NOW()
            WHERE id = ${reportId}
          `;
        }

        if (body.adminNotes !== undefined) {
          if (!isAdmin) {
            throw APIError.permissionDenied("Only admins can leave report feedback.");
          }
          await db.exec`
            UPDATE reports
            SET admin_notes = ${body.adminNotes.trim()}, updated_at = NOW()
            WHERE id = ${reportId}
          `;
        }

        if (body.annotatedImage !== undefined) {
          const normalized = body.annotatedImage?.trim() || null;
          const annotatedObjectKey = normalized ? await uploadReportImage(normalized, `reports/${reportId}/annotated`) : null;
          await db.exec`
            UPDATE reports
            SET annotated_image = ${annotatedObjectKey}, updated_at = NOW()
            WHERE id = ${reportId}
          `;
          if (existing?.annotated_image) {
            await removeReportImage(existing.annotated_image);
          }
        }

        const reports = await listReportsFromDb();
        const report = reports.find((entry) => entry.id === reportId);
        if (!report) {
          throw APIError.notFound("Report not found.");
        }

        sendJson(resp, 200, { report });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const deleteReport = api.raw(
  { expose: true, method: "DELETE", path: "/reports/:reportId" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const reportId = extractReportId(req.url);
        await ensureReportWritableForRequest(req, reportId);
        const existing = await db.queryRow<{ image: string; annotated_image: string | null }>`
          SELECT image, annotated_image
          FROM reports
          WHERE id = ${reportId}
        `;
        await db.exec`DELETE FROM reports WHERE id = ${reportId}`;
        await Promise.all([
          removeReportImage(existing?.image ?? null),
          removeReportImage(existing?.annotated_image ?? null),
        ]);
        sendJson(resp, 204);
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const reportsPreflightRoot = api.raw(
  { expose: true, method: "OPTIONS", path: "/reports" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);

export const reportsPreflightById = api.raw(
  { expose: true, method: "OPTIONS", path: "/reports/:reportId" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);
