import { AuthSkeleton } from "@/components/auth/auth-skeleton";

export default function LoginLoading() {
	return <AuthSkeleton fields={1} />;
}
