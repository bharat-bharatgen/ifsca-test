"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * @typedef {Object} Tab
 * @property {string} title - The title of the tab.
 * @property {string} value - The value of the tab.
 * @property {string | React.ReactNode | any} [content] - The content of the tab.
 */

/**
 * Tabs component to display and manage a set of tabs.
 *
 * @param {Object} props - The properties of the component.
 * @param {Tab[]} props.tabs - The array of tabs.
 * @param {string} [props.containerClassName] - Additional classes for the container.
 * @param {string} [props.activeTabClassName] - Additional classes for the active tab.
 * @param {string} [props.tabClassName] - Additional classes for each tab.
 * @param {string} [props.contentClassName] - Additional classes for the content.
 * @returns {JSX.Element} The rendered Tabs component.
 */
export const ProductMockupTabs = ({
  tabs: propTabs,
  containerClassName,
  activeTabClassName,
  tabClassName,
  contentClassName,
}) => {
  const [active, setActive] = useState(propTabs[0]);
  const [tabs, setTabs] = useState(propTabs);

  /**
   * Move the selected tab to the top of the tabs array.
   *
   * @param {number} idx - The index of the selected tab.
   */
  const moveSelectedTabToTop = (idx) => {
    const newTabs = [...propTabs];
    const selectedTab = newTabs.splice(idx, 1);
    newTabs.unshift(selectedTab[0]);
    setTabs(newTabs);
    setActive(newTabs[0]);
  };

  const [hovering, setHovering] = useState(false);

  return (
    <>
      <div
        className={cn(
          "flex flex-row flex-wrap md:flex-nowrap mt-20 items-center justify-start [perspective:1000px] relative overflow-auto sm:overflow-visible no-visible-scrollbar max-w-full w-full z-[50]",
          containerClassName
        )}
      >
        {propTabs.map((tab, idx) => (
          <button
            key={tab.title}
            onClick={async () => {
              await new Promise((resolve) =>
                setTimeout(() => {
                  moveSelectedTabToTop(idx);
                  resolve();
                }, 200)
              );
              setHovering(false);
            }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            className={cn("relative px-4 py-2 m-1 rounded-full", tabClassName)}
            style={{
              transformStyle: "preserve-3d",
            }}
          >
            {active.value === tab.value && (
              <motion.div
                layoutId="clickedbutton"
                transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                className={cn(
                  "absolute inset-0 bg-gray-200 dark:bg-zinc-800 rounded-full ",
                  activeTabClassName
                )}
              />
            )}

            <span
              className={cn(
                "relative block",
                active.value === tab.value
                  ? "text-white"
                  : "text-black dark:text-white"
              )}
            >
              {tab.title}
            </span>
          </button>
        ))}
      </div>
      <FadeInDiv
        tabs={tabs}
        active={active}
        key={active.value}
        hovering={hovering}
        className={cn("mt-32", contentClassName)}
      />
    </>
  );
};

/**
 * FadeInDiv component to display the content of the active tab with animation.
 *
 * @param {Object} props - The properties of the component.
 * @param {string} [props.className] - Additional classes for the component.
 * @param {Tab[]} props.tabs - The array of tabs.
 * @param {Tab} props.active - The active tab.
 * @param {boolean} [props.hovering] - Whether the mouse is hovering over a tab.
 * @returns {JSX.Element} The rendered FadeInDiv component.
 */
export const FadeInDiv = ({ className, tabs, active, hovering }) => {
  /**
   * Check if a tab is the active tab.
   *
   * @param {Tab} tab - The tab to check.
   * @returns {boolean} True if the tab is active, otherwise false.
   */
  const isActive = (tab) => {
    return tab.value === tabs[0].value;
  };

  return (
    <div className="relative w-full h-full z-10">
      {tabs.map((tab, idx) => (
        <motion.div
          key={tab.value}
          layoutId={tab.value}
          style={{
            scale: 1 - idx * 0.1,
            top: hovering ? idx * -50 : 0,
            zIndex: -idx,
            opacity: idx < 3 ? 1 - idx * 0.1 : 0,
          }}
          animate={{
            y: isActive(tab) ? [0, 40, 0] : 0,
          }}
          className={cn("w-full h-full absolute top-0 left-0", className)}
        >
          {tab.content}
        </motion.div>
      ))}
    </div>
  );
};
