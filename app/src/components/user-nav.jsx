import Link from "next/link";
import { Icons } from "./icons";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { UserCog } from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "./ui/use-toast";
import { useState, useEffect } from "react";

export const UserNav = ({ session: initialSession }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const isGuest = initialSession?.user?.isGuest;

  useEffect(() => {
    if (initialSession?.user) {
      setCurrentUser(initialSession.user);
    }
  }, [initialSession]);

  const handleProfileClick = (e) => {
    if (isGuest) {
      e.preventDefault();
      toast({
        title: "Create an account to access this feature",
        description: "Please sign in to continue",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      {isGuest ? (
        <DropdownMenuTrigger asChild>
          <Button
            onClick={() => signOut({ callbackUrl: "/login", redirect: true })}
            variant="ghost"
            size="sm"
            className="w-full font-medium text-left cursor-pointer"
          >
            Create Account
          </Button>
        </DropdownMenuTrigger>
      ) : (
        <>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="flex items-center gap-2 rounded-full"
            >
              <span className="sr-only">Open user menu</span>
              <Avatar>
                <AvatarImage
                  src={currentUser?.image || initialSession?.user?.image}
                  alt={currentUser?.name || initialSession?.user?.name}
                />
                <AvatarFallback>
                  {currentUser?.name ? (
                    currentUser.name.charAt(0).toUpperCase()
                  ) : (
                    <Icons.user className="w-6 h-6" />
                  )}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <div className="px-4 py-2 border-b">
              <p className="text-sm font-medium truncate">
                {currentUser?.name || initialSession?.user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {currentUser?.email || initialSession?.user?.email}
              </p>
            </div>
            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                className="flex items-center gap-2 font-medium cursor-pointer text-md"
                prefetch={false}
                onClick={handleProfileClick}
              >
                <UserCog className="w-4 h-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Button
                onClick={() =>
                  signOut({ callbackUrl: "/login", redirect: true })
                }
                variant="ghost"
                size="sm"
                className="w-full font-medium text-left cursor-pointer"
              >
                Sign Out
              </Button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </>
      )}
    </DropdownMenu>
  );
};
