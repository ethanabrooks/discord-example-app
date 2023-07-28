{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/";
    utils.url = "github:numtide/flake-utils/";
  };

  outputs = {
    self,
    nixpkgs,
    utils,
  }: let
    out = system: let
      pkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfree = true;
          permittedInsecurePackages = [
            "openssl-1.1.1u"
          ];
        };
      };
    in {
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          alejandra
          nodejs_20
          ngrok
          yarn
          libuuid
          openssl_1_1
        ];
        OPENSSL_PATH = "${builtins.toString pkgs.openssl_1_1.out}/lib/";
        PYTHONBREAKPOINT = "ipdb.set_trace";
        shellHook = ''
          set -o allexport
          source .env
          set +o allexport
        '';
      };
    };
  in
    utils.lib.eachDefaultSystem out;
}
