import axios from "axios";
import { cookies } from "next/headers";

const API_URL =
	process.env.API_URL ||
	process.env.NEXT_PUBLIC_API_URL ||
	"http://localhost:3000";

export async function apiServer(locale?: string) {
	const cookieStore = await cookies();
	const accessToken = cookieStore.get("web_access_token")?.value;

	const instance = axios.create({
		baseURL: API_URL,
		headers: {
			"Content-Type": "application/json",
			...(locale && { "Accept-Language": locale }),
			...(accessToken && { Authorization: `Bearer ${accessToken}` }),
			Cookie: cookieStore.toString(),
		},
	});

	return instance;
}
