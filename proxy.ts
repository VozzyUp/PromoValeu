// Renova o token do Supabase Auth a cada requisição (os Server Components não podem gravar cookies).
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/** Endereço sem www (promovaleu.com.br) vai para o oficial (www.promovaleu.com.br): uma página só para o Google. */
function wwwRedirect(request: NextRequest): NextResponse | null {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return null;
  const official = new URL(site);
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase();
  if (!official.host.startsWith("www.") || host !== official.host.slice(4)) return null;
  return NextResponse.redirect(`${official.origin}${request.nextUrl.pathname}${request.nextUrl.search}`, 301);
}

export async function proxy(request: NextRequest) {
  const moved = wwwRedirect(request);
  if (moved) return moved;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // Não colocar código entre createServerClient e getClaims: é aqui que o token expirado é trocado.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Fora: arquivos estáticos, imagens e o redirecionamento /ir/ (não precisa de sessão e tem de ser rápido).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|ir/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
