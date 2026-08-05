import { NextResponse } from "next/server";

/**
 * GET /api/docs
 *
 * Returns OpenAPI/Swagger spec for EduMatch API.
 * This is a minimal spec covering Phase 2 endpoints.
 */
export async function GET() {
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "EduMatch API",
      version: "2.0.0",
      description: "EduMatch API: Inquiry flow, AI responses, tutor marketplace, trust/safety, and admin controls",
    },
    servers: [
      { url: "http://localhost:3005", description: "Local dev" },
    ],
    paths: {
      "/api/inquiries": {
        post: {
          summary: "Create a new inquiry",
          tags: ["Inquiries"],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject", "gradeLevel", "description"],
                  properties: {
                    subject: { type: "string", minLength: 2, maxLength: 50 },
                    gradeLevel: { type: "string", enum: ["K12", "UNDERGRAD", "GRAD"] },
                    description: { type: "string", minLength: 20, maxLength: 5000 },
                    attachments: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string" },
                          url: { type: "string" },
                          mime: { type: "string" },
                          sizeBytes: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Inquiry created" },
            "400": { description: "Validation error" },
            "401": { description: "Unauthorized" },
          },
        },
        get: {
          summary: "List student inquiries",
          tags: ["Inquiries"],
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "List of inquiries" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/inquiries/{id}": {
        get: {
          summary: "Get inquiry details with AI responses",
          tags: ["Inquiries"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Inquiry details" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/inquiries/{id}/ai": {
        get: {
          summary: "Stream AI response (SSE)",
          tags: ["Inquiries", "AI"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "stream", in: "query", schema: { type: "integer", enum: [0, 1] } },
          ],
          responses: {
            "200": { description: "SSE stream", content: { "text/event-stream": {} } },
          },
        },
      },
      "/api/inquiries/{id}/quote-request": {
        post: {
          summary: "Request tutor quotes for an inquiry",
          tags: ["Quote Requests"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    studentLocation: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } } },
                    address: { type: "string" },
                    preferOnline: { type: "boolean" },
                    maxDistanceKm: { type: "number" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Quote request created" },
          },
        },
      },
      "/api/quote-requests/{id}/quotes": {
        post: {
          summary: "Tutor submits a quote",
          tags: ["Quotes"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["hourlyRateCents", "estimatedHours"],
                  properties: {
                    hourlyRateCents: { type: "integer" },
                    estimatedHours: { type: "number" },
                    availabilitySlots: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          start: { type: "string", format: "date-time" },
                          end: { type: "string", format: "date-time" },
                          mode: { type: "string", enum: ["ONLINE", "IN_PERSON"] },
                        },
                      },
                    },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Quote submitted" },
          },
        },
        get: {
          summary: "List quotes for a quote request (student)",
          tags: ["Quotes"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "List of quotes" },
          },
        },
      },
      "/api/quotes/{id}/accept": {
        post: {
          summary: "Student accepts a quote",
          tags: ["Quotes"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Quote accepted, booking created" },
          },
        },
      },
      "/api/quotes/{id}/decline": {
        post: {
          summary: "Student declines a quote",
          tags: ["Quotes"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Quote declined" },
          },
        },
      },
      "/api/tutors/quote-requests": {
        get: {
          summary: "List available quote requests for tutor",
          tags: ["Quote Requests"],
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "List of quote requests" },
          },
        },
      },
      "/api/student/profile": {
        post: {
          summary: "Create or update student profile",
          tags: ["Profiles"],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    gradeLevel: { type: "string", enum: ["K12", "UNDERGRAD", "GRAD"] },
                    subjectsOfInterest: { type: "array", items: { type: "string" } },
                    homeAddress: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Profile created/updated" },
          },
        },
        get: {
          summary: "Get student profile",
          tags: ["Profiles"],
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "Student profile" },
          },
        },
      },
      "/api/notifications": {
        get: {
          summary: "List user notifications",
          tags: ["Notifications"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "unreadOnly", in: "query", schema: { type: "boolean" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": { description: "List of notifications with unread count" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Mark all notifications as read",
          tags: ["Notifications"],
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { action: { type: "string", enum: ["mark-all-read"] } },
                },
              },
            },
          },
          responses: {
            "200": { description: "All notifications marked as read" },
          },
        },
      },
      "/api/notifications/{id}/mark-read": {
        post: {
          summary: "Mark a single notification as read",
          tags: ["Notifications"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Notification marked as read" },
            "404": { description: "Not found or already read" },
          },
        },
      },
      "/api/tutor/profile": {
        post: {
          summary: "Create or update tutor profile",
          tags: ["Profiles"],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    bio: { type: "string" },
                    subjectsTaught: { type: "array", items: { type: "string" } },
                    levelsTaught: { type: "array", items: { type: "string" } },
                    hourlyRateCents: { type: "integer" },
                    onlineOnly: { type: "boolean" },
                    serviceRadiusKm: { type: "integer" },
                    homeAddress: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Profile created/updated" },
          },
        },
      },
      "/api/bookings/{id}/cancel": {
        post: {
          summary: "Cancel a booking (student, tutor, or admin)",
          tags: ["Bookings", "Trust & Safety"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reason"],
                  properties: {
                    reason: { type: "string", description: "Cancellation reason" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Booking cancelled" },
            "400": { description: "Invalid transition or missing reason" },
            "403": { description: "Not authorized to cancel this booking" },
          },
        },
      },
      "/api/bookings/{id}/dispute": {
        post: {
          summary: "Open a dispute on a booking",
          tags: ["Bookings", "Trust & Safety"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reason"],
                  properties: {
                    reason: { type: "string", description: "Dispute reason" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Dispute opened" },
            "400": { description: "Invalid transition or missing reason" },
            "403": { description: "Not authorized to dispute this booking" },
          },
        },
      },
      "/api/bookings/{id}/resolve": {
        post: {
          summary: "Admin resolves a booking dispute",
          tags: ["Bookings", "Trust & Safety", "Admin"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["resolution", "reason"],
                  properties: {
                    resolution: { type: "string", enum: ["REFUND", "NO_REFUND"], description: "Resolution type" },
                    reason: { type: "string", description: "Resolution reason" },
                    refundCents: { type: "integer", description: "Refund amount in cents (if REFUND)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Dispute resolved" },
            "400": { description: "Invalid resolution" },
            "403": { description: "Admin access required" },
          },
        },
      },
      "/api/admin/tutor-verifications": {
        get: {
          summary: "List tutor verification queue (admin only)",
          tags: ["Admin", "Trust & Safety"],
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "List of tutors with verification status" },
            "403": { description: "Admin access required" },
          },
        },
      },
      "/api/admin/tutor-verifications/{id}": {
        get: {
          summary: "Get tutor verification details (admin only)",
          tags: ["Admin", "Trust & Safety"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Tutor ID" },
          ],
          responses: {
            "200": { description: "Verification details and history" },
            "403": { description: "Admin access required" },
          },
        },
        post: {
          summary: "Update tutor verification status (admin only)",
          tags: ["Admin", "Trust & Safety"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Tutor ID" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: { type: "string", enum: ["PENDING", "NEEDS_CHANGES", "VERIFIED", "REJECTED"], description: "New verification status" },
                    checklist: { type: "object", description: "Verification checklist items" },
                    adminNotes: { type: "string", description: "Internal admin notes" },
                    tutorMessage: { type: "string", description: "Message to tutor (for NEEDS_CHANGES)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Verification status updated" },
            "400": { description: "Invalid status" },
            "403": { description: "Admin access required" },
          },
        },
      },
      "/api/me/notification-preferences": {
        get: {
          summary: "Get notification preferences",
          tags: ["Notifications", "Preferences"],
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "Notification preferences" },
          },
        },
        post: {
          summary: "Update notification preferences",
          tags: ["Notifications", "Preferences"],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    emailQuoteRequests: { type: "boolean" },
                    emailBookings: { type: "boolean" },
                    emailMessages: { type: "boolean" },
                    emailMarketing: { type: "boolean" },
                    pushEnabled: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Preferences updated" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  };

  return NextResponse.json(spec);
}
