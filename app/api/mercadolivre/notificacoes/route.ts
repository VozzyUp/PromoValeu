// O Mercado Livre exige um endereço de notificações no app. Não usamos notificações: só confirmamos o recebimento.
export async function POST() {
  return new Response(null, { status: 200 });
}

export async function GET() {
  return new Response(null, { status: 200 });
}
