export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cacao text-linen">
      {children}
    </div>
  );
}
