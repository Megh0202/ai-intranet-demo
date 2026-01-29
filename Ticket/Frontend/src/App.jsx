import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true); // 1. Add a loading state

  useEffect(() => {
    async function fetchTickets() {
      try {
        const response = await fetch('http://localhost:5000/ticket/all');
        const data = await response.json(); // 2. Must await response.json()
        setTickets(data);
      } catch (error) {
        console.error("Error fetching tickets:", error);
      } finally {
        setLoading(false); // 3. Stop loading whether success or error
      }
    }
    fetchTickets();
  }, []);

  // 4. Conditional rendering: show this while waiting
  if (loading) {
    return <div className="loading">Loading tickets...</div>;
  }

  return (
    <>
      <div>
        <h1>Tickets</h1>
        {tickets?.length > 0 ? (
          tickets.map((ticket) => (
            <div key={ticket.id}>
              <h2>{ticket.title}</h2>
              <p>{ticket.description}</p>
            </div>
          ))
        ) : (
          <p>No tickets found.</p>
        )}
      </div>
    </>
  );
}

export default App;
