import { onRequestPost as __api_create_checkout_session_js_onRequestPost } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/create-checkout-session.js"
import { onRequestPost as __api_create_subscription_session_js_onRequestPost } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/create-subscription-session.js"
import { onRequestGet as __api_cron_payment_chases_js_onRequestGet } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/cron-payment-chases.js"
import { onRequestGet as __api_cron_quote_follow_ups_js_onRequestGet } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/cron-quote-follow-ups.js"
import { onRequestGet as __api_cron_recurring_reminders_js_onRequestGet } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/cron-recurring-reminders.js"
import { onRequestPost as __api_feedback_notify_js_onRequestPost } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/feedback-notify.js"
import { onRequestGet as __api_resend_webhook_js_onRequestGet } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/resend-webhook.js"
import { onRequestPost as __api_resend_webhook_js_onRequestPost } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/resend-webhook.js"
import { onRequestPost as __api_stripe_connect_onboard_js_onRequestPost } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/stripe-connect-onboard.js"
import { onRequestPost as __api_stripe_webhook_js_onRequestPost } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/api/stripe-webhook.js"
import { onRequestGet as __book_payment_cancelled_js_onRequestGet } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/book/payment-cancelled.js"
import { onRequestGet as __book_payment_success_js_onRequestGet } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/book/payment-success.js"
import { onRequest as __book___slug___js_onRequest } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/book/[[slug]].js"
import { onRequestGet as __unsubscribe_js_onRequestGet } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/unsubscribe.js"
import { onRequestPost as __unsubscribe_js_onRequestPost } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/unsubscribe.js"
import { onRequest as ___middleware_js_onRequest } from "/Users/niravarvinda/Workspace/projects/TradePad/functions/_middleware.js"

export const routes = [
    {
      routePath: "/api/create-checkout-session",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_create_checkout_session_js_onRequestPost],
    },
  {
      routePath: "/api/create-subscription-session",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_create_subscription_session_js_onRequestPost],
    },
  {
      routePath: "/api/cron-payment-chases",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_cron_payment_chases_js_onRequestGet],
    },
  {
      routePath: "/api/cron-quote-follow-ups",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_cron_quote_follow_ups_js_onRequestGet],
    },
  {
      routePath: "/api/cron-recurring-reminders",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_cron_recurring_reminders_js_onRequestGet],
    },
  {
      routePath: "/api/feedback-notify",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_feedback_notify_js_onRequestPost],
    },
  {
      routePath: "/api/resend-webhook",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_resend_webhook_js_onRequestGet],
    },
  {
      routePath: "/api/resend-webhook",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_resend_webhook_js_onRequestPost],
    },
  {
      routePath: "/api/stripe-connect-onboard",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_stripe_connect_onboard_js_onRequestPost],
    },
  {
      routePath: "/api/stripe-webhook",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_stripe_webhook_js_onRequestPost],
    },
  {
      routePath: "/book/payment-cancelled",
      mountPath: "/book",
      method: "GET",
      middlewares: [],
      modules: [__book_payment_cancelled_js_onRequestGet],
    },
  {
      routePath: "/book/payment-success",
      mountPath: "/book",
      method: "GET",
      middlewares: [],
      modules: [__book_payment_success_js_onRequestGet],
    },
  {
      routePath: "/book/:slug*",
      mountPath: "/book",
      method: "",
      middlewares: [],
      modules: [__book___slug___js_onRequest],
    },
  {
      routePath: "/unsubscribe",
      mountPath: "/",
      method: "GET",
      middlewares: [],
      modules: [__unsubscribe_js_onRequestGet],
    },
  {
      routePath: "/unsubscribe",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__unsubscribe_js_onRequestPost],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]