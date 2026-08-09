"use client";
import { useQuoteStore } from "@/store/quoteStore";
import { Plus, Trash2 } from "lucide-react";

export default function CalculatorPage() {
  const {
    customerName,
    creditDays,
    items,
    setCustomerDetails,
    addItem,
    updateItemQty,
    removeItem,
  } = useQuoteStore();

  const handleAddNewItem = () => {
    const mockProduct = {
      id: crypto.randomUUID(),
      productId: "prod-123",
      productName: "Catalyst DBTDL",
      qty: 1000,
      cifUsd: 12.0,
      defaultProfitPct: 5,
    };
    addItem(mockProduct);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Quotation Calculator</h1>

      {/* Header Controls */}
      <div className="grid grid-cols-4 gap-4 bg-gray-50 p-6 rounded-lg border">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Customer Name
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) =>
              setCustomerDetails({ customerName: e.target.value })
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
            placeholder="Enter customer..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Credit Days
          </label>
          <select
            value={creditDays}
            onChange={(e) =>
              setCustomerDetails({ creditDays: Number(e.target.value) })
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
          >
            <option value={0}>0 Days (Cash)</option>
            <option value={30}>30 Days</option>
            <option value={60}>60 Days</option>
            <option value={90}>90 Days</option>
          </select>
        </div>
      </div>

      {/* Line Items Data Grid */}
      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                Qty (Kg)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                Total Cost (AED)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                Sales Price (AED)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                Profit (AED)
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {item.productName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <input
                    type="number"
                    value={item.qty}
                    onChange={(e) =>
                      updateItemQty(item.id, Number(e.target.value))
                    }
                    className="w-24 border rounded p-1"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.totalCost.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">
                  {item.salesPrice.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.profitAmount.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="p-4 bg-gray-50 border-t">
          <button
            onClick={handleAddNewItem}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            <Plus size={18} /> Add Product
          </button>
        </div>
      </div>
    </div>
  );
}
