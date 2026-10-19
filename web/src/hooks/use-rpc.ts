"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { RpcError, toAppError, type AppError } from "@/lib/errors";

type Opts<TVars, TData> = {
  invalidate?: QueryKey[];
  success?: string | ((data: TData, vars: TVars) => string | null);
  onSuccess?: (data: TData, vars: TVars) => void;
  onError?: (err: AppError, vars: TVars) => void;
  silentError?: boolean;
};

// Wraps an RPC call: toasts the { code, message, field } error shape and
// invalidates affected queries on success. Errors never discard user input.
export function useRpc<TVars, TData>(fn: (vars: TVars) => Promise<TData>, opts: Opts<TVars, TData> = {}) {
  const qc = useQueryClient();
  return useMutation<TData, RpcError, TVars>({
    mutationFn: async (vars) => {
      try {
        return await fn(vars);
      } catch (e) {
        throw e instanceof RpcError ? e : new RpcError(toAppError(e));
      }
    },
    onSuccess: (data, vars) => {
      for (const key of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: key });
      const msg = typeof opts.success === "function" ? opts.success(data, vars) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(data, vars);
    },
    onError: (err, vars) => {
      const appErr = { code: err.code, message: err.message, field: err.field };
      if (!opts.silentError) toast.error(appErr.message);
      opts.onError?.(appErr, vars);
    },
  });
}
