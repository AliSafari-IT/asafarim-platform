"use client";

import { useActionState } from "react";
import {
  Alert,
  Button,
  FormRow,
  Input,
  Label,
  Textarea,
} from "@asafarim/ui";
import { sendContactMessage } from "./actions";

export function ContactForm() {
  const [state, formAction, pending] = useActionState(sendContactMessage, {
    status: "idle",
  });

  if (state.status === "success") {
    return (
      <Alert tone="info">
        Message sent — I'll reply to you within 24–48 hours.
      </Alert>
    );
  }

  return (
    <form action={formAction} aria-label="Project inquiry">
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
      <FormRow>
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={100}
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={200}
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="message">Project details</Label>
        <Textarea
          id="message"
          name="message"
          placeholder="What are you building, roughly when, and what does done look like?"
          required
          minLength={10}
          maxLength={5000}
        />
      </FormRow>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
