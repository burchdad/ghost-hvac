import ClientMonitor from "@/components/ClientMonitor";

type ClientPageProps = {
  params: {
    clientId: string;
  };
};

export default function ClientPage({ params }: ClientPageProps) {
  return <ClientMonitor clientId={params.clientId} />;
}