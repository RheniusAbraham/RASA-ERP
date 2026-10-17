import PageHeader from "@/components/PageHeader";
import ManageContractsView from "@/components/contracts/ManageContractsView";

export default function Page() {
  return (
    <>
      <PageHeader title="Closed Contracts" />
      <ManageContractsView closed />
    </>
  );
}
