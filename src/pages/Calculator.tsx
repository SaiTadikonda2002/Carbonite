import { useState } from 'react';
import { Calculator as CalcIcon } from 'lucide-react';

export default function Calculator() {
  const [transport, setTransport] = useState({ car: 0, flight: 0, publicTransport: 0 });
  const [home, setHome] = useState({ electricity: 0, gas: 0 });
  const [food, setFood] = useState({ meat: 0, dairy: 0 });
  const [totalEmissions, setTotalEmissions] = useState(0);

  const calculateFootprint = () => {
    const carEmissions = transport.car * 0.12;
    const flightEmissions = transport.flight * 0.25;
    const publicTransportEmissions = transport.publicTransport * 0.04;
    const electricityEmissions = home.electricity * 0.4;
    const gasEmissions = home.gas * 2.3;
    const meatEmissions = food.meat * 6.6;
    const dairyEmissions = food.dairy * 1.9;

    const total =
      carEmissions +
      flightEmissions +
      publicTransportEmissions +
      electricityEmissions +
      gasEmissions +
      meatEmissions +
      dairyEmissions;

    setTotalEmissions(total);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Carbon Footprint Calculator</h1>
        <p className="text-gray-600 mt-1">
          Calculate your monthly carbon emissions
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">Transportation</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Car travel (km/month)
                </label>
                <input
                  type="number"
                  value={transport.car}
                  onChange={(e) => setTransport({ ...transport, car: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Flight distance (km/month)
                </label>
                <input
                  type="number"
                  value={transport.flight}
                  onChange={(e) => setTransport({ ...transport, flight: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Public transport (km/month)
                </label>
                <input
                  type="number"
                  value={transport.publicTransport}
                  onChange={(e) => setTransport({ ...transport, publicTransport: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">Home Energy</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Electricity (kWh/month)
                </label>
                <input
                  type="number"
                  value={home.electricity}
                  onChange={(e) => setHome({ ...home, electricity: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Natural gas (cubic meters/month)
                </label>
                <input
                  type="number"
                  value={home.gas}
                  onChange={(e) => setHome({ ...home, gas: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">Food & Diet</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Meat consumption (servings/week)
                </label>
                <input
                  type="number"
                  value={food.meat}
                  onChange={(e) => setFood({ ...food, meat: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dairy consumption (servings/week)
                </label>
                <input
                  type="number"
                  value={food.dairy}
                  onChange={(e) => setFood({ ...food, dairy: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>

          <button
            onClick={calculateFootprint}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-4 rounded-lg font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
          >
            <CalcIcon className="w-5 h-5" />
            <span>Calculate My Footprint</span>
          </button>
        </div>
      </div>

      {totalEmissions > 0 && (
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Your Monthly Carbon Footprint</h2>
          <div className="text-5xl font-bold mb-4">{(totalEmissions * 2.20462).toFixed(1)} lbs CO₂</div>
          <p className="text-emerald-100 mb-6">
            This is equivalent to driving approximately {Math.round(totalEmissions / 0.12)} km in a car.
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white/20 p-4 rounded-lg">
              <div className="text-2xl font-bold">{((totalEmissions * 12) * 2.20462).toFixed(0)} lbs</div>
              <div className="text-sm text-emerald-100">Annual emissions</div>
            </div>
            <div className="bg-white/20 p-4 rounded-lg">
              <div className="text-2xl font-bold">{Math.ceil(totalEmissions * 12 / 20)}</div>
              <div className="text-sm text-emerald-100">Trees needed to offset</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
