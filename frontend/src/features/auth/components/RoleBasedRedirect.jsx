"use client";



import { useEffect } from "react";

import { useSearchParams } from "next/navigation";

import { useAuth } from "@/context/AuthContext";

import { AUTH_ROLES, getDashboardRouteByRole, isKnownPortalRole, normalizeAuthRole } from "@/utils/authRoles";

import authService from "@/services/authService";

import { prefetchPortalRoutes } from "@/utils/portalPrefetch";

import { warmPortalDataBundle } from "@/utils/portalDataPrefetch";

import { useSafeRouter } from "@/hooks/useSafeRouter";



const RoleBasedRedirect = () => {

  const { currentUser, loading, isAuthenticated, setAuthUser } = useAuth();

  const searchParams = useSearchParams();

  const { router, safeReplace, isRouterReady } = useSafeRouter();



  useEffect(() => {

    if (!isRouterReady || loading) return;



    if (!isAuthenticated || !currentUser) {

      safeReplace("/?login=true");

      return;

    }

    if (!authService.getValidToken()) {

      setAuthUser?.(null);

      safeReplace("/?login=true");

      return;

    }



    const actualRole = normalizeAuthRole(currentUser.role, currentUser.email);

    if (!isKnownPortalRole(actualRole, currentUser.email)) {

      setAuthUser?.(null);

      safeReplace("/?login=true");

      return;

    }

    const expectedType = searchParams.get("type");

    const expectedRole =

      expectedType === "admin"

        ? AUTH_ROLES.SUPER_ADMIN

        : expectedType === "spoc"

          ? AUTH_ROLES.SPOC

          : expectedType === "trainer"

            ? AUTH_ROLES.TRAINER

            : null;



    if (expectedRole && expectedRole !== actualRole) {

      alert(

        `Redirected to your correct dashboard. You logged in as ${actualRole} but selected ${expectedType.toUpperCase()} login.`,

      );

    }



    const targetRoute = getDashboardRouteByRole(actualRole, currentUser.email);

    if (targetRoute.startsWith("/login")) {

      safeReplace("/?login=true");

      return;

    }



    prefetchPortalRoutes(router, actualRole, currentUser.email);

    // Navigate immediately, warm data in background
    safeReplace(targetRoute);
    
    // Warm portal data in background (don't block navigation)
    if (typeof window !== "undefined") {
      Promise.resolve()
        .then(() => warmPortalDataBundle())
        .catch(error => console.warn("Portal data warmup failed (non-blocking):", error));
    }

  }, [loading, currentUser, isAuthenticated, searchParams, router, safeReplace, setAuthUser, isRouterReady]);



  return (

    <div className="flex items-center justify-center min-h-screen">

      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>

    </div>

  );

};



export default RoleBasedRedirect;

