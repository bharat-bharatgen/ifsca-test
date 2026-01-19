import Confetti from "react-dom-confetti";

const config = {
  angle: "180",
  spread: 360,
  startVelocity: 60,
  elementCount: "1500",
  dragFriction: 0.12,
  duration: "3000",
  stagger: 3,
  width: "10px",
  height: "10px",
  perspective: "500px",
  colors: ["#a864fd", "#29cdff", "#78ff44", "#ff718d", "#fdff6a"],
};

export const Celebrate = ({ celebrate }) => {
  return (
    <>
      <div style={{ zIndex: 20000 }} className="fixed left-24 bottom-2">
        <Confetti active={celebrate} config={config} />
      </div>
      <div style={{ zIndex: 20000 }} className="fixed right-2 bottom-2">
        <Confetti active={celebrate} config={config} />
      </div>
    </>
  );
};
