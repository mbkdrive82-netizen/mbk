import {
  AUTH_ERROR_MESSAGES,
  resolveAuthErrorMessage,
} from "./authErrorHandler";

const isObjectLike = (value) => value !== null && typeof value === "object";

export { AUTH_ERROR_MESSAGES, resolveAuthErrorMessage };

export const getErrorMessage = (error, fallback = "Something went wrong") => {
  if (!error) return fallback;
  if (typeof error === "string") return error;

  const authMessage = resolveAuthErrorMessage(error, "");
  if (authMessage) return authMessage;

  if (error instanceof Error && error.message) return error.message;

  if (!isObjectLike(error)) return fallback;

  return (
    error.message ||
    error.response?.message ||
    error.response?.data?.message ||
    error.response?.error ||
    error.data?.message ||
    error.error ||
    fallback
  );
};

export default getErrorMessage;
